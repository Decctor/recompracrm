import { getErrorMessage } from "@/lib/errors";
import { PRIVATE_FILES_BUCKET } from "@/lib/files-storage/buckets";
import { getOrganizationFileById, readStoredFile, sanitizeFileName, storeFile } from "@/lib/files/service";
import type { TFiscalInboundDocumentModelEnum, TFiscalInboundManifestEventEnum, TFiscalInboundSituacaoEnum } from "@/schemas/enums";
import { db, type DBTransaction } from "@/services/drizzle";
import { fiscalInboundDocuments, fiscalInboundSyncStates, suppliers, type TFiscalInboundDocumentEntity } from "@/services/drizzle/schema";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { notifyInboundDocumentCancelled } from "../notifications";
import { loadFiscalOrganization } from "../settings";
import { downloadStoredFiscalAsset, getFiscalAssetContentType } from "../storage";
import type { TFiscalOrganization } from "../types";
import { getFiscalEntryDocumentPrefix } from "./entry-files";
import { resolveInboundProvider } from "./providers";
import type { IFiscalInboundProvider, TInboundDocumentSnapshot, TInboundManifestState } from "./types";

const MAX_PAGES = 10;
const RECONCILE_BATCH_SIZE = 25;
const AUTO_CIENCIA_BATCH_SIZE = 50;

async function getOrCreateSyncState(organizacaoId: string) {
	const existing = await db.query.fiscalInboundSyncStates.findFirst({
		where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId),
	});
	if (existing) return existing;
	const [created] = await db
		.insert(fiscalInboundSyncStates)
		.values({ organizacaoId })
		.onConflictDoNothing({ target: [fiscalInboundSyncStates.organizacaoId] })
		.returning();
	if (created) return created;
	const raced = await db.query.fiscalInboundSyncStates.findFirst({ where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId) });
	if (!raced) throw new createHttpError.InternalServerError("Falha ao criar estado de sincronizacao inbound.");
	return raced;
}

async function resolveOrCreateSupplier(organizacaoId: string, cpfCnpj?: string | null, nome?: string | null): Promise<string | null> {
	const digits = (cpfCnpj ?? "").replace(/\D/g, "");
	if (!digits) return null;
	const existing = await db.query.suppliers.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.organizacaoId, organizacaoId), operators.eq(fields.cpfCnpj, digits)),
	});
	if (existing) return existing.id;
	const [created] = await db
		.insert(suppliers)
		.values({ organizacaoId, nome: nome?.trim() || "Fornecedor sem nome", cpfCnpj: digits })
		.returning({ id: suppliers.id });
	return created?.id ?? null;
}

function buildManifestFields(manifestacao: TInboundManifestState | null | undefined) {
	// Manifestacao rejeitada pela SEFAZ ou ausente no snapshot nao sobrescreve o registro local:
	// o snapshot pode ser mais velho que uma manifestacao recem-registrada por nos.
	if (!manifestacao?.evento || manifestacao.rejeitada) return {};
	return {
		manifestacaoAtual: manifestacao.evento,
		manifestacaoProtocolo: manifestacao.protocolo ?? null,
		manifestacaoData: manifestacao.data ?? null,
		manifestacaoJustificativa: manifestacao.justificativa ?? null,
	};
}

// Assets de nota recebida entram no catalogo `files` (lib/files/README.md); nenhuma coluna guarda caminho.
async function storeInboundAsset({
	organizacaoId,
	chaveAcesso,
	asset,
	buffer,
}: {
	organizacaoId: string;
	chaveAcesso: string;
	asset: "xml" | "pdf";
	buffer: ArrayBuffer;
}) {
	const mimeType = getFiscalAssetContentType(asset);
	const fileName = sanitizeFileName(`${chaveAcesso}-${asset}`, mimeType);
	return storeFile({
		organizacaoId,
		bucket: PRIVATE_FILES_BUCKET,
		caminho: `${getFiscalEntryDocumentPrefix({ organizacaoId })}${crypto.randomUUID()}/${fileName}`,
		visibilidade: "PRIVADO",
		buffer: Buffer.from(buffer),
		mimeType,
		nomeOriginal: `${chaveAcesso}.${asset}`,
	});
}

async function storeInboundXmlIfAvailable({
	organizationId,
	snapshot,
	provider,
	organization,
}: {
	organizationId: string;
	snapshot: TInboundDocumentSnapshot;
	provider: IFiscalInboundProvider;
	organization: TFiscalOrganization;
}): Promise<string | null> {
	if (!provider.downloadXml) return null;
	try {
		const buffer = await provider.downloadXml({ provedorDocumentoId: snapshot.provedorDocumentoId, chaveAcesso: snapshot.chaveAcesso }, organization);
		if (!buffer) return null;
		const arquivo = await storeInboundAsset({ organizacaoId: organizationId, chaveAcesso: snapshot.chaveAcesso, asset: "xml", buffer });
		return arquivo.id;
	} catch (error) {
		// XML fica para a proxima rodada (reconciliacao); a nota em si nao pode ser perdida por isso.
		console.warn(`[FISCAL_INBOUND] Falha ao baixar XML da nota ${snapshot.chaveAcesso}: ${getErrorMessage(error)}`);
		return null;
	}
}

// Unico write-path de notas recebidas: poll (cron) e webhook convergem aqui.
// Upsert por (organizacao, chaveAcesso); promove a completo baixando o XML quando disponivel.
/** Posições 21–22 da chave de acesso são o modelo: 55 = NF-e, 57 = CT-e. */
export function getInboundDocumentModelFromAccessKey(chaveAcesso: string): TFiscalInboundDocumentModelEnum {
	return chaveAcesso.replace(/\D/g, "").slice(20, 22) === "57" ? "CTE" : "NFE";
}

export async function applyInboundSnapshot({
	organizationId,
	snapshot,
	provider,
	organization,
}: {
	organizationId: string;
	snapshot: TInboundDocumentSnapshot;
	provider: IFiscalInboundProvider;
	organization: TFiscalOrganization;
}): Promise<{ created: boolean }> {
	if (!snapshot.chaveAcesso) return { created: false };

	const existing = await db.query.fiscalInboundDocuments.findFirst({
		where: (fields, operators) =>
			operators.and(operators.eq(fields.organizacaoId, organizationId), operators.eq(fields.chaveAcesso, snapshot.chaveAcesso)),
	});

	const provedor = organization.fiscalProvedor === "SPEDY" ? ("SPEDY" as const) : ("MANUAL" as const);
	const emitenteCnpj = snapshot.emitenteCpfCnpj ? snapshot.emitenteCpfCnpj.replace(/\D/g, "") : null;
	const modelo = getInboundDocumentModelFromAccessKey(snapshot.chaveAcesso);

	if (!existing) {
		const fornecedorId = await resolveOrCreateSupplier(organizationId, snapshot.emitenteCpfCnpj, snapshot.emitenteNome);
		const xmlArquivoId = snapshot.completo ? await storeInboundXmlIfAvailable({ organizationId, snapshot, provider, organization }) : null;
		const [inserted] = await db
			.insert(fiscalInboundDocuments)
			.values({
				organizacaoId: organizationId,
				fornecedorId,
				chaveAcesso: snapshot.chaveAcesso,
				modelo,
				provedor,
				provedorDocumentoId: snapshot.provedorDocumentoId ?? null,
				completo: snapshot.completo,
				situacao: snapshot.situacao ?? null,
				emitenteCnpj,
				emitenteNome: snapshot.emitenteNome ?? null,
				valorTotal: snapshot.valorTotal ?? null,
				dataEmissao: snapshot.dataEmissao ?? null,
				xmlArquivoId,
				eventosPayload: snapshot.eventos ? JSON.stringify(snapshot.eventos) : null,
				resumoPayload: snapshot.resumoPayload ? JSON.stringify(snapshot.resumoPayload) : null,
				...buildManifestFields(snapshot.manifestacao),
			})
			// Corrida entre cron e webhook: quem perder a corrida reaplica como update.
			.onConflictDoNothing({ target: [fiscalInboundDocuments.organizacaoId, fiscalInboundDocuments.chaveAcesso] })
			.returning({ id: fiscalInboundDocuments.id });
		if (inserted) return { created: true };
		return applyInboundSnapshot({ organizationId, snapshot, provider, organization });
	}

	const xmlArquivoId =
		snapshot.completo && !existing.xmlArquivoId && !existing.xmlStoragePath
			? await storeInboundXmlIfAvailable({ organizationId, snapshot, provider, organization })
			: existing.xmlArquivoId;

	const nextSituacao = snapshot.situacao ?? existing.situacao;
	await db
		.update(fiscalInboundDocuments)
		.set({
			provedor,
			provedorDocumentoId: snapshot.provedorDocumentoId ?? existing.provedorDocumentoId,
			// Completo nunca regride: um snapshot resumo atrasado nao pode rebaixar a nota.
			completo: existing.completo || snapshot.completo,
			situacao: snapshot.situacao ?? existing.situacao,
			emitenteCnpj: emitenteCnpj ?? existing.emitenteCnpj,
			emitenteNome: snapshot.emitenteNome ?? existing.emitenteNome,
			valorTotal: snapshot.valorTotal ?? existing.valorTotal,
			dataEmissao: snapshot.dataEmissao ?? existing.dataEmissao,
			xmlArquivoId,
			eventosPayload: snapshot.eventos ? JSON.stringify(snapshot.eventos) : existing.eventosPayload,
			resumoPayload: snapshot.resumoPayload ? JSON.stringify(snapshot.resumoPayload) : existing.resumoPayload,
			dataAtualizacao: new Date(),
			...buildManifestFields(snapshot.manifestacao),
		})
		.where(eq(fiscalInboundDocuments.id, existing.id));

	// Nota que ja virou compra e deixou de valer na SEFAZ: avisa quem lancou (a compra nao e desfeita
	// sozinha) — o recebimento passa a ser recusado por `assertLinkedInboundDocumentsReceivable`.
	const becameInvalid = nextSituacao !== existing.situacao && (nextSituacao === "CANCELADA" || nextSituacao === "DENEGADA");
	if (becameInvalid && existing.compraId) {
		const purchase = await db.query.purchases.findFirst({
			where: (fields, operators) => operators.eq(fields.id, existing.compraId!),
			columns: { id: true, titulo: true, status: true },
		});
		if (purchase)
			await notifyInboundDocumentCancelled({
				organization,
				document: { chaveAcesso: existing.chaveAcesso, emitenteNome: existing.emitenteNome, valorTotal: existing.valorTotal },
				purchase,
			});
	}
	return { created: false };
}

async function persistManifestReadback(documentId: string, evento: TFiscalInboundManifestEventEnum, manifestacao: TInboundManifestState | null) {
	await db
		.update(fiscalInboundDocuments)
		.set({
			manifestacaoAtual: manifestacao?.evento ?? evento,
			manifestacaoProtocolo: manifestacao?.protocolo ?? null,
			manifestacaoData: manifestacao?.data ?? new Date(),
			manifestacaoJustificativa: manifestacao?.justificativa ?? null,
			dataAtualizacao: new Date(),
		})
		.where(eq(fiscalInboundDocuments.id, documentId));
}

async function autoManifestCiencia(organizationId: string, organization: TFiscalOrganization, provider: IFiscalInboundProvider) {
	const pendentes = await db.query.fiscalInboundDocuments.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizationId),
				operators.isNull(fields.manifestacaoAtual),
				operators.isNotNull(fields.provedorDocumentoId),
			),
		limit: AUTO_CIENCIA_BATCH_SIZE,
	});
	for (const doc of pendentes) {
		try {
			const result = await provider.manifest(
				{ evento: "CIENCIA" },
				{ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso },
				organization,
			);
			await persistManifestReadback(doc.id, "CIENCIA", result.manifestacao);
		} catch (error) {
			// Tenta de novo na proxima rodada, mas registra o motivo (ex.: evento ja manifestado
			// por outro sistema) para a falha nao ficar invisivel.
			console.warn(`[FISCAL_INBOUND] Falha ao manifestar ciencia da nota ${doc.chaveAcesso} (org ${organizationId}): ${getErrorMessage(error)}`);
		}
	}
}

// Notas manifestadas cujo XML completo ainda nao chegou: reconsulta o provedor e reaplica o
// snapshot (a SEFAZ redistribui o XML minutos/horas depois da manifestacao).
async function reconcilePendingCompleteDocuments(organizationId: string, organization: TFiscalOrganization, provider: IFiscalInboundProvider) {
	if (!provider.getDocument) return;
	const pendentes = await db.query.fiscalInboundDocuments.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizationId),
				operators.eq(fields.completo, false),
				operators.isNotNull(fields.manifestacaoAtual),
				operators.isNotNull(fields.provedorDocumentoId),
			),
		orderBy: (fields) => [asc(fields.dataAtualizacao)],
		limit: RECONCILE_BATCH_SIZE,
	});
	for (const doc of pendentes) {
		try {
			const snapshot = await provider.getDocument({ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso }, organization);
			if (snapshot) await applyInboundSnapshot({ organizationId, snapshot, provider, organization });
			else await db.update(fiscalInboundDocuments).set({ dataAtualizacao: new Date() }).where(eq(fiscalInboundDocuments.id, doc.id));
		} catch (error) {
			// Empurra para o fim da fila de reconciliacao para nao travar o batch nas mesmas notas.
			await db.update(fiscalInboundDocuments).set({ dataAtualizacao: new Date() }).where(eq(fiscalInboundDocuments.id, doc.id));
			console.warn(`[FISCAL_INBOUND] Falha ao reconciliar nota ${doc.chaveAcesso} (org ${organizationId}): ${getErrorMessage(error)}`);
		}
	}
}

// Consulta a telemetria de sync do provedor e dispara sync sob demanda respeitando a janela
// de rate limit da autoridade (SEFAZ). Falhas aqui nao impedem a listagem.
async function maybeRequestProviderSync(syncStateId: string, organization: TFiscalOrganization, provider: IFiscalInboundProvider) {
	try {
		if (provider.getSyncStatus) {
			const status = await provider.getSyncStatus(organization);
			if (status) {
				await db
					.update(fiscalInboundSyncStates)
					.set({
						ultimaSincronizacao: status.lastSyncAt,
						proximaSincronizacaoPermitida: status.nextAllowedSyncAt,
						ultimoDesfecho: status.outcome,
						ultimaMensagem: status.mensagem,
						dataAtualizacao: new Date(),
					})
					.where(eq(fiscalInboundSyncStates.id, syncStateId));
				if (status.nextAllowedSyncAt && status.nextAllowedSyncAt.getTime() > Date.now()) return;
			}
		}
		if (!provider.requestSync) return;
		const result = await provider.requestSync(organization);
		if (!result.accepted && result.retryAfterSeconds) {
			await db
				.update(fiscalInboundSyncStates)
				.set({ proximaSincronizacaoPermitida: new Date(Date.now() + result.retryAfterSeconds * 1000), dataAtualizacao: new Date() })
				.where(eq(fiscalInboundSyncStates.id, syncStateId));
		}
	} catch (error) {
		console.warn(`[FISCAL_INBOUND] Falha ao sincronizar com o provedor (org ${organization.id}): ${getErrorMessage(error)}`);
	}
}

// Varre o provedor incrementalmente (checkpoint opaco) e aplica os snapshots. Auto-ciencia e
// reconciliacao de XML completo rodam na sequencia. Rede de seguranca dos webhooks.
export async function pollInboundDocuments({ organizationId }: { organizationId: string }) {
	const organization = await loadFiscalOrganization(organizationId);
	const dfeConfig = organization?.fiscalConfiguracao?.dfe;
	if (!organization?.fiscalConfiguracao?.cpfCnpj || !dfeConfig?.habilitado) return { novos: 0 };

	const provider = resolveInboundProvider(organization);
	const syncState = await getOrCreateSyncState(organizationId);
	await maybeRequestProviderSync(syncState.id, organization, provider);

	let checkpoint = syncState.checkpoint;
	let novos = 0;

	for (let i = 0; i < MAX_PAGES; i++) {
		const result = await provider.listDocuments({ checkpoint }, organization);
		for (const snapshot of result.documentos) {
			const { created } = await applyInboundSnapshot({ organizationId, snapshot, provider, organization });
			if (created) novos++;
		}
		checkpoint = result.checkpoint;
		// Persiste o checkpoint a cada pagina: a varredura e retomavel de onde parou.
		await db.update(fiscalInboundSyncStates).set({ checkpoint, dataAtualizacao: new Date() }).where(eq(fiscalInboundSyncStates.id, syncState.id));
		if (!result.hasMore) break;
	}

	if (dfeConfig.autoCiencia) await autoManifestCiencia(organizationId, organization, provider);
	await reconcilePendingCompleteDocuments(organizationId, organization, provider);
	return { novos };
}

export async function pollInboundForAllOrganizations({ limit = 50 }: { limit?: number } = {}) {
	const orgs = await db.query.organizations.findMany({
		where: (fields, operators) => operators.isNotNull(fields.fiscalConfiguracao),
		columns: { id: true },
		limit,
	});
	let totalNovos = 0;
	for (const org of orgs) {
		try {
			const { novos } = await pollInboundDocuments({ organizationId: org.id });
			totalNovos += novos;
		} catch (error) {
			// Segue para a proxima organizacao, mas registra: uma organizacao quebrada nao pode
			// falhar silenciosamente para sempre.
			console.error(`[FISCAL_INBOUND] Falha ao consultar notas recebidas da organizacao ${org.id}: ${getErrorMessage(error)}`);
		}
	}
	return { organizacoes: orgs.length, novos: totalNovos };
}

async function getInboundDocumentOrThrow(organizationId: string, inboundId: string) {
	const doc = await db.query.fiscalInboundDocuments.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.organizacaoId, organizationId), operators.eq(fields.id, inboundId)),
	});
	if (!doc) throw new createHttpError.NotFound("Nota recebida nao encontrada.");
	return doc;
}

export async function manifestInboundDocument({
	organizationId,
	inboundId,
	evento,
	justificativa,
}: {
	organizationId: string;
	inboundId: string;
	evento: TFiscalInboundManifestEventEnum;
	justificativa?: string | null;
}) {
	const doc = await getInboundDocumentOrThrow(organizationId, inboundId);
	const organization = await loadFiscalOrganization(organizationId);
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const provider = resolveInboundProvider(organization);
	const result = await provider.manifest(
		{ evento, justificativa },
		{ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso },
		organization,
	);
	await persistManifestReadback(doc.id, evento, result.manifestacao);

	return {
		inboundId: doc.id,
		evento: result.manifestacao?.evento ?? evento,
		protocolo: result.manifestacao?.protocolo ?? null,
		data: result.manifestacao?.data ?? null,
	};
}

export type TInboundListFilter = "TODAS" | "PENDENTES" | "LANCADAS";

export async function listInboundDocuments({
	organizationId,
	page = 1,
	lancamento = "TODAS",
}: {
	organizationId: string;
	page?: number;
	lancamento?: TInboundListFilter;
}) {
	const PAGE_SIZE = 25;
	const offset = (page - 1) * PAGE_SIZE;
	const whereClause = and(
		eq(fiscalInboundDocuments.organizacaoId, organizationId),
		lancamento === "PENDENTES" ? isNull(fiscalInboundDocuments.compraId) : undefined,
		lancamento === "LANCADAS" ? isNotNull(fiscalInboundDocuments.compraId) : undefined,
	);

	const [documents, [{ count }]] = await Promise.all([
		db.query.fiscalInboundDocuments.findMany({
			where: whereClause,
			with: {
				fornecedor: { columns: { id: true, nome: true, cpfCnpj: true } },
				compra: { columns: { id: true, titulo: true, status: true } },
			},
			orderBy: (fields, operators) => [operators.desc(fields.dataInsercao)],
			offset,
			limit: PAGE_SIZE,
		}),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(fiscalInboundDocuments)
			.where(whereClause),
	]);

	return { documents, documentsMatched: count ?? 0, totalPages: Math.ceil((count ?? 0) / PAGE_SIZE) };
}

// Baixa (e cacheia no storage) um asset da nota recebida sob demanda via provedor.
async function fetchAndCacheInboundAsset({ doc, asset }: { doc: TFiscalInboundDocumentEntity; asset: "xml" | "pdf" }): Promise<ArrayBuffer | null> {
	if (!doc.provedorDocumentoId) return null;
	const organization = await loadFiscalOrganization(doc.organizacaoId);
	if (!organization) return null;
	const provider = resolveInboundProvider(organization);
	const download = asset === "xml" ? provider.downloadXml?.bind(provider) : provider.downloadPdf?.bind(provider);
	if (!download) return null;
	const buffer = await download({ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso }, organization);
	if (!buffer) return null;
	const arquivo = await storeInboundAsset({ organizacaoId: doc.organizacaoId, chaveAcesso: doc.chaveAcesso, asset, buffer });
	await db
		.update(fiscalInboundDocuments)
		.set(asset === "xml" ? { xmlArquivoId: arquivo.id } : { pdfArquivoId: arquivo.id })
		.where(eq(fiscalInboundDocuments.id, doc.id));
	return buffer;
}

// Catalogo primeiro; o caminho legado so ate o backfill (scripts/backfill-purchase-fiscal-files.ts).
async function readCachedInboundAsset(doc: TFiscalInboundDocumentEntity, asset: "xml" | "pdf"): Promise<ArrayBuffer | null> {
	const arquivoId = asset === "xml" ? doc.xmlArquivoId : doc.pdfArquivoId;
	if (arquivoId) {
		const arquivo = await getOrganizationFileById({ arquivoId, organizacaoId: doc.organizacaoId });
		const bytes = await readStoredFile(arquivo);
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	}
	const storagePath = asset === "xml" ? doc.xmlStoragePath : doc.pdfStoragePath;
	return storagePath ? downloadStoredFiscalAsset(storagePath) : null;
}

export async function getInboundDocumentXml({ organizationId, inboundId }: { organizationId: string; inboundId: string }) {
	const doc = await getInboundDocumentOrThrow(organizationId, inboundId);
	const cached = await readCachedInboundAsset(doc, "xml");
	if (cached) return { buffer: cached, contentType: getFiscalAssetContentType("xml") };
	const buffer = await fetchAndCacheInboundAsset({ doc, asset: "xml" });
	if (!buffer) throw new createHttpError.NotFound("XML da nota recebida nao disponivel.");
	return { buffer, contentType: getFiscalAssetContentType("xml") };
}

export async function getInboundDocumentPdf({ organizationId, inboundId }: { organizationId: string; inboundId: string }) {
	const doc = await getInboundDocumentOrThrow(organizationId, inboundId);
	const cached = await readCachedInboundAsset(doc, "pdf");
	if (cached) return { buffer: cached, contentType: getFiscalAssetContentType("pdf") };
	// DANFE so existe quando o XML completo foi liberado pela SEFAZ.
	if (!doc.completo) throw new createHttpError.NotFound("DANFE disponivel apenas apos a nota estar completa.");
	const buffer = await fetchAndCacheInboundAsset({ doc, asset: "pdf" });
	if (!buffer) throw new createHttpError.NotFound("DANFE da nota recebida nao disponivel.");
	return { buffer, contentType: getFiscalAssetContentType("pdf") };
}

// Sync sob demanda (botao "Sincronizar agora"): repassa a janela de rate limit quando negado.
export async function requestInboundSyncNow({ organizationId }: { organizationId: string }) {
	const organization = await loadFiscalOrganization(organizationId);
	const dfeConfig = organization?.fiscalConfiguracao?.dfe;
	if (!organization || !dfeConfig?.habilitado) throw new createHttpError.BadRequest("Notas recebidas nao habilitadas para a organizacao.");

	const provider = resolveInboundProvider(organization);
	if (!provider.requestSync) throw new createHttpError.BadRequest("Sincronizacao sob demanda indisponivel para o provedor fiscal atual.");

	const syncState = await getOrCreateSyncState(organizationId);
	const result = await provider.requestSync(organization);
	const nextAllowedSyncAt = !result.accepted && result.retryAfterSeconds ? new Date(Date.now() + result.retryAfterSeconds * 1000) : null;
	if (nextAllowedSyncAt) {
		await db
			.update(fiscalInboundSyncStates)
			.set({ proximaSincronizacaoPermitida: nextAllowedSyncAt, dataAtualizacao: new Date() })
			.where(eq(fiscalInboundSyncStates.id, syncState.id));
	}
	return { accepted: result.accepted, nextAllowedSyncAt };
}

// ============================================================================
// Documento fiscal como primitivo unico (ADR-0002, decisao 1): todo XML com chave vira uma linha
// aqui, venha do DF-e ou de upload manual. O unique (organizacao, chave) e a deduplicacao.
// ============================================================================

export type TRegisterManualInboundDocumentInput = {
	organizacaoId: string;
	chaveAcesso: string;
	modelo: TFiscalInboundDocumentModelEnum;
	xmlArquivoId: string;
	emitenteCnpj?: string | null;
	emitenteNome?: string | null;
	valorTotal?: number | null;
	dataEmissao?: Date | null;
	// XML com protocolo de autorizacao e AUTORIZADA; sem protocolo nao se afirma nada.
	situacao?: TFiscalInboundSituacaoEnum | null;
};

/**
 * Registra (ou reaproveita) a linha de um documento enviado a mao. Nunca rebaixa o que o DF-e ja
 * sabe: provedor, manifestacao e situacao existentes ficam; so preenche o que estava vazio.
 * Devolve a linha atual — quem chama decide o que fazer com `compraId` ja preenchido.
 */
export async function registerManualInboundDocument(input: TRegisterManualInboundDocumentInput): Promise<TFiscalInboundDocumentEntity> {
	const existing = await db.query.fiscalInboundDocuments.findFirst({
		where: and(eq(fiscalInboundDocuments.organizacaoId, input.organizacaoId), eq(fiscalInboundDocuments.chaveAcesso, input.chaveAcesso)),
	});
	const emitenteCnpj = input.emitenteCnpj?.replace(/\D/g, "") || null;

	if (!existing) {
		const fornecedorId = await resolveOrCreateSupplier(input.organizacaoId, emitenteCnpj, input.emitenteNome);
		const [inserted] = await db
			.insert(fiscalInboundDocuments)
			.values({
				organizacaoId: input.organizacaoId,
				fornecedorId,
				chaveAcesso: input.chaveAcesso,
				modelo: input.modelo,
				provedor: "MANUAL",
				completo: true,
				situacao: input.situacao ?? null,
				emitenteCnpj,
				emitenteNome: input.emitenteNome ?? null,
				valorTotal: input.valorTotal ?? null,
				dataEmissao: input.dataEmissao ?? null,
				xmlArquivoId: input.xmlArquivoId,
			})
			// Corrida com o cron do DF-e: quem perder reaplica como update.
			.onConflictDoNothing({ target: [fiscalInboundDocuments.organizacaoId, fiscalInboundDocuments.chaveAcesso] })
			.returning();
		if (inserted) return inserted;
		return registerManualInboundDocument(input);
	}

	const [updated] = await db
		.update(fiscalInboundDocuments)
		.set({
			completo: true,
			situacao: existing.situacao ?? input.situacao ?? null,
			emitenteCnpj: existing.emitenteCnpj ?? emitenteCnpj,
			emitenteNome: existing.emitenteNome ?? input.emitenteNome ?? null,
			valorTotal: existing.valorTotal ?? input.valorTotal ?? null,
			dataEmissao: existing.dataEmissao ?? input.dataEmissao ?? null,
			xmlArquivoId: existing.xmlArquivoId ?? input.xmlArquivoId,
			dataAtualizacao: new Date(),
		})
		.where(eq(fiscalInboundDocuments.id, existing.id))
		.returning();
	return updated ?? existing;
}

/**
 * Vincula as notas de uma compra (`compraId` e 1:1 nesta fase). Uma nota ja presa a outra compra
 * e conflito, nao sobrescrita: a mesma NF-e lancada duas vezes dobraria estoque e passivo.
 */
export async function linkInboundDocumentsToPurchase({
	trx,
	organizationId,
	purchaseId,
	documentIds,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
	documentIds: string[];
}) {
	const ids = [...new Set(documentIds.filter(Boolean))];
	if (ids.length === 0) return;
	const docs = await trx.query.fiscalInboundDocuments.findMany({
		where: and(eq(fiscalInboundDocuments.organizacaoId, organizationId), inArray(fiscalInboundDocuments.id, ids)),
		columns: { id: true, compraId: true, chaveAcesso: true },
	});
	if (docs.length !== ids.length) throw new createHttpError.BadRequest("Documento fiscal da compra não encontrado.");
	const taken = docs.find((doc) => doc.compraId && doc.compraId !== purchaseId);
	if (taken) throw new createHttpError.Conflict(`A nota ${taken.chaveAcesso} já está lançada em outra compra.`);
	await trx
		.update(fiscalInboundDocuments)
		.set({ compraId: purchaseId, dataAtualizacao: new Date() })
		.where(
			and(eq(fiscalInboundDocuments.organizacaoId, organizationId), inArray(fiscalInboundDocuments.id, ids), isNull(fiscalInboundDocuments.compraId)),
		);
}

/** Compra cancelada devolve as notas ao estado "a lancar". */
export async function unlinkInboundDocumentsFromPurchase({
	trx,
	organizationId,
	purchaseId,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
}) {
	await trx
		.update(fiscalInboundDocuments)
		.set({ compraId: null, dataAtualizacao: new Date() })
		.where(and(eq(fiscalInboundDocuments.organizacaoId, organizationId), eq(fiscalInboundDocuments.compraId, purchaseId)));
}

/** Compras ja vinculadas as chaves informadas (para a validacao de nota complementar). */
export async function findPurchasesByAccessKeys({ organizationId, chavesAcesso }: { organizationId: string; chavesAcesso: string[] }) {
	if (chavesAcesso.length === 0) return [];
	return db.query.fiscalInboundDocuments.findMany({
		where: and(eq(fiscalInboundDocuments.organizacaoId, organizationId), inArray(fiscalInboundDocuments.chaveAcesso, chavesAcesso)),
		columns: { chaveAcesso: true, compraId: true },
	});
}

/**
 * Receber uma compra cuja nota foi cancelada ou denegada na SEFAZ daria entrada em mercadoria sem
 * documento valido. Confere as notas que a compra vai vincular e as que ja estao vinculadas.
 */
export async function assertLinkedInboundDocumentsReceivable({
	trx,
	organizationId,
	purchaseId,
	documentIds,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string | null;
	documentIds: string[];
}) {
	const ids = [...new Set(documentIds.filter(Boolean))];
	if (ids.length === 0 && !purchaseId) return;
	const invalid = await trx.query.fiscalInboundDocuments.findFirst({
		where: and(
			eq(fiscalInboundDocuments.organizacaoId, organizationId),
			inArray(fiscalInboundDocuments.situacao, ["CANCELADA", "DENEGADA"]),
			or(ids.length > 0 ? inArray(fiscalInboundDocuments.id, ids) : undefined, purchaseId ? eq(fiscalInboundDocuments.compraId, purchaseId) : undefined),
		),
		columns: { chaveAcesso: true, situacao: true },
	});
	if (invalid)
		throw new createHttpError.UnprocessableEntity(
			`A nota ${invalid.chaveAcesso} consta como ${invalid.situacao === "DENEGADA" ? "denegada" : "cancelada"} na SEFAZ. Cancele a compra ou lance a nota substituta antes de receber.`,
		);
}

/**
 * Opt-in `dfe.confirmarAoReceber`: a compra recebida confirma a operacao das notas que a originaram.
 * Roda FORA da transacao da compra e nunca lanca — a SEFAZ fora do ar nao pode desfazer um
 * recebimento; a nota fica para manifestacao manual.
 */
export async function confirmInboundDocumentsOnReceive({ organizationId, purchaseId }: { organizationId: string; purchaseId: string }) {
	const organization = await loadFiscalOrganization(organizationId);
	if (!organization?.fiscalConfiguracao?.dfe?.confirmarAoReceber) return { confirmadas: 0 };
	const provider = resolveInboundProvider(organization);
	const docs = await db.query.fiscalInboundDocuments.findMany({
		where: and(
			eq(fiscalInboundDocuments.organizacaoId, organizationId),
			eq(fiscalInboundDocuments.compraId, purchaseId),
			isNotNull(fiscalInboundDocuments.provedorDocumentoId),
		),
	});
	let confirmadas = 0;
	for (const doc of docs) {
		// Confirmacao e definitiva; desconhecimento/nao realizada tambem. So quem esta em ciencia (ou
		// sem manifestacao) pode subir para confirmada.
		if (doc.manifestacaoAtual && doc.manifestacaoAtual !== "CIENCIA") continue;
		try {
			const result = await provider.manifest(
				{ evento: "CONFIRMACAO" },
				{ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso },
				organization,
			);
			await persistManifestReadback(doc.id, "CONFIRMACAO", result.manifestacao);
			confirmadas += 1;
		} catch (error) {
			console.warn(`[FISCAL_INBOUND] Falha ao confirmar a nota ${doc.chaveAcesso} ao receber a compra ${purchaseId}: ${getErrorMessage(error)}`);
		}
	}
	return { confirmadas };
}

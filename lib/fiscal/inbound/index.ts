import { getErrorMessage } from "@/lib/errors";
import type { TFiscalInboundManifestEventEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { fiscalInboundDocuments, fiscalInboundSyncStates, suppliers, type TFiscalInboundDocumentEntity } from "@/services/drizzle/schema";
import { asc, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { loadFiscalOrganization } from "../settings";
import { downloadStoredFiscalAsset, getFiscalAssetContentType, storeFiscalAsset } from "../storage";
import type { TFiscalOrganization } from "../types";
import { resolveInboundProvider } from "./providers";
import type { IFiscalInboundProvider, TInboundDocumentSnapshot, TInboundManifestState } from "./types";

const MAX_PAGES = 10;
const RECONCILE_BATCH_SIZE = 25;
const AUTO_CIENCIA_BATCH_SIZE = 50;
// A SEFAZ recusa a ciencia apresentada mais de 10 dias depois da emissao ("Evento apresentado apos
// o prazo permitido"). Fora da janela a nota nao tem mais ciencia possivel: sem este corte, as
// mesmas 50 notas vencidas ocupavam o lote e eram reenviadas (e rejeitadas) a cada rodada do cron.
const AUTO_CIENCIA_PRAZO_DIAS = 10;

async function getOrCreateSyncState(organizacaoId: string) {
	const existing = await db.query.fiscalInboundSyncStates.findFirst({ where: (fields, operators) => operators.eq(fields.organizacaoId, organizacaoId) });
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

async function storeInboundXmlIfAvailable({
	snapshot,
	provider,
	organization,
}: {
	snapshot: TInboundDocumentSnapshot;
	provider: IFiscalInboundProvider;
	organization: TFiscalOrganization;
}): Promise<string | null> {
	if (!provider.downloadXml) return null;
	try {
		const buffer = await provider.downloadXml({ provedorDocumentoId: snapshot.provedorDocumentoId, chaveAcesso: snapshot.chaveAcesso }, organization);
		if (!buffer) return null;
		return await storeFiscalAsset({ documentoId: `inbound-${snapshot.chaveAcesso}`, tipo: "entrada", asset: "xml", buffer });
	} catch (error) {
		// XML fica para a proxima rodada (reconciliacao); a nota em si nao pode ser perdida por isso.
		console.warn(`[FISCAL_INBOUND] Falha ao baixar XML da nota ${snapshot.chaveAcesso}: ${getErrorMessage(error)}`);
		return null;
	}
}

// Unico write-path de notas recebidas: poll (cron) e webhook convergem aqui.
// Upsert por (organizacao, chaveAcesso); promove a completo baixando o XML quando disponivel.
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
		where: (fields, operators) => operators.and(operators.eq(fields.organizacaoId, organizationId), operators.eq(fields.chaveAcesso, snapshot.chaveAcesso)),
	});

	const provedor = organization.fiscalProvedor === "SPEDY" ? ("SPEDY" as const) : ("MANUAL" as const);
	const emitenteCnpj = snapshot.emitenteCpfCnpj ? snapshot.emitenteCpfCnpj.replace(/\D/g, "") : null;

	if (!existing) {
		const fornecedorId = await resolveOrCreateSupplier(organizationId, snapshot.emitenteCpfCnpj, snapshot.emitenteNome);
		const xmlStoragePath = snapshot.completo ? await storeInboundXmlIfAvailable({ snapshot, provider, organization }) : null;
		const [inserted] = await db
			.insert(fiscalInboundDocuments)
			.values({
				organizacaoId: organizationId,
				fornecedorId,
				chaveAcesso: snapshot.chaveAcesso,
				provedor,
				provedorDocumentoId: snapshot.provedorDocumentoId ?? null,
				completo: snapshot.completo,
				situacao: snapshot.situacao ?? null,
				emitenteCnpj,
				emitenteNome: snapshot.emitenteNome ?? null,
				valorTotal: snapshot.valorTotal ?? null,
				dataEmissao: snapshot.dataEmissao ?? null,
				xmlStoragePath,
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

	const xmlStoragePath =
		snapshot.completo && !existing.xmlStoragePath ? await storeInboundXmlIfAvailable({ snapshot, provider, organization }) : existing.xmlStoragePath;

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
			xmlStoragePath,
			eventosPayload: snapshot.eventos ? JSON.stringify(snapshot.eventos) : existing.eventosPayload,
			resumoPayload: snapshot.resumoPayload ? JSON.stringify(snapshot.resumoPayload) : existing.resumoPayload,
			dataAtualizacao: new Date(),
			...buildManifestFields(snapshot.manifestacao),
		})
		.where(eq(fiscalInboundDocuments.id, existing.id));
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
	const prazoCutoff = new Date(Date.now() - AUTO_CIENCIA_PRAZO_DIAS * 24 * 60 * 60 * 1000);
	const pendentes = await db.query.fiscalInboundDocuments.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizationId),
				operators.isNull(fields.manifestacaoAtual),
				operators.isNotNull(fields.provedorDocumentoId),
				// Sem data de emissao (resumo incompleto), a insercao e o limite inferior conhecido. Colunas
				// tipadas, nao `coalesce`: comparada a uma expressao `sql`, a data vai crua ao driver, que
				// recusa o `Date` e derrubava a consulta inteira.
				operators.or(
					operators.gt(fields.dataEmissao, prazoCutoff),
					operators.and(operators.isNull(fields.dataEmissao), operators.gt(fields.dataInsercao, prazoCutoff)),
				),
			),
		// Mais antigas primeiro: sao as mais perto de perder o prazo.
		orderBy: (fields, operators) => operators.asc(sql`coalesce(${fields.dataEmissao}, ${fields.dataInsercao})`),
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
		await db
			.update(fiscalInboundSyncStates)
			.set({ checkpoint, dataAtualizacao: new Date() })
			.where(eq(fiscalInboundSyncStates.id, syncState.id));
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

export async function listInboundDocuments({ organizationId, page = 1 }: { organizationId: string; page?: number }) {
	const PAGE_SIZE = 25;
	const offset = (page - 1) * PAGE_SIZE;
	const whereClause = eq(fiscalInboundDocuments.organizacaoId, organizationId);

	const [documents, [{ count }]] = await Promise.all([
		db.query.fiscalInboundDocuments.findMany({
			where: whereClause,
			with: { fornecedor: { columns: { id: true, nome: true, cpfCnpj: true } } },
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
async function fetchAndCacheInboundAsset({
	doc,
	asset,
}: {
	doc: TFiscalInboundDocumentEntity;
	asset: "xml" | "pdf";
}): Promise<ArrayBuffer | null> {
	if (!doc.provedorDocumentoId) return null;
	const organization = await loadFiscalOrganization(doc.organizacaoId);
	if (!organization) return null;
	const provider = resolveInboundProvider(organization);
	const download = asset === "xml" ? provider.downloadXml?.bind(provider) : provider.downloadPdf?.bind(provider);
	if (!download) return null;
	const buffer = await download({ provedorDocumentoId: doc.provedorDocumentoId, chaveAcesso: doc.chaveAcesso }, organization);
	if (!buffer) return null;
	const storagePath = await storeFiscalAsset({ documentoId: `inbound-${doc.chaveAcesso}`, tipo: "entrada", asset, buffer });
	await db
		.update(fiscalInboundDocuments)
		.set(asset === "xml" ? { xmlStoragePath: storagePath } : { pdfStoragePath: storagePath })
		.where(eq(fiscalInboundDocuments.id, doc.id));
	return buffer;
}

export async function getInboundDocumentXml({ organizationId, inboundId }: { organizationId: string; inboundId: string }) {
	const doc = await getInboundDocumentOrThrow(organizationId, inboundId);
	if (doc.xmlStoragePath) {
		return { buffer: await downloadStoredFiscalAsset(doc.xmlStoragePath), contentType: getFiscalAssetContentType("xml") };
	}
	const buffer = await fetchAndCacheInboundAsset({ doc, asset: "xml" });
	if (!buffer) throw new createHttpError.NotFound("XML da nota recebida nao disponivel.");
	return { buffer, contentType: getFiscalAssetContentType("xml") };
}

export async function getInboundDocumentPdf({ organizationId, inboundId }: { organizationId: string; inboundId: string }) {
	const doc = await getInboundDocumentOrThrow(organizationId, inboundId);
	if (doc.pdfStoragePath) {
		return { buffer: await downloadStoredFiscalAsset(doc.pdfStoragePath), contentType: getFiscalAssetContentType("pdf") };
	}
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

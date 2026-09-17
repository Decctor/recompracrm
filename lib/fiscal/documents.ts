import { processFiscalDocumentDanfeAutoPrintIfEligible } from "@/lib/desktop-agent/auto-print";
import { getSaleChangeTotal, netSaleChangeFromPayments } from "@/lib/sales/sale-change";
import { isValidCpfCnpj } from "@/lib/validation";
import { db } from "@/services/drizzle";
import { fiscalDocumentEvents, fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { getErrorMessage } from "../errors";
import { classifyFiscalDocumentEvent, describeFiscalEmissionResult } from "./document-event-classification";
import { shouldApplyProviderSnapshot, shouldReplaceActionableRejection } from "./provider-snapshot-policy";
import { buildFiscalReference } from "./constants";
import { EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH, EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH } from "./exceptional-presence";
import { getFiscalRejectionInfo } from "./rejections";
import { formatValidationMessages, hasBlockingErrors, type TFiscalTaxGroupWithRules } from "./engine";
import { FiscalReadinessError } from "./errors";
import {
	buildFiscalProblem,
	buildSefazProblem,
	buildValidationProblems,
	serializeFiscalProblems,
	toFiscalProblemsFromError,
	type TFiscalProblem,
} from "./problems";
import { computeSaleTaxation } from "./taxation-context";
import { assertFiscalDocumentActionAvailable } from "./document-actions";
import { loadFiscalDocumentActions } from "./document-actions-loader";
import { ManualFiscalProvider } from "./providers/manual";
import { SpedyFiscalProvider } from "./providers/spedy";
import { findActiveFiscalSeries, loadFiscalOrganization, reserveFiscalSeriesNumber } from "./settings";
import { resolveOperationProfileForSale } from "./operation-profile";
import { downloadStoredFiscalAsset, getFiscalAssetContentType, storeFiscalAsset, type TFiscalAssetType } from "./storage";
import type {
	IFiscalProvider,
	TCancelDocumentInput,
	TEmitirDocumentoInput,
	TFiscalCorrectionInput,
	TFiscalInutilizationInput,
	TProviderDocumentDetails,
	TSaleForFiscal,
	TFiscalSaleContext,
	TFiscalSalePayment,
	TSyncDocumentInput,
} from "./types";

function resolveFiscalProvider(fiscalProvedor: "MANUAL" | "SPEDY" | string | null | undefined): IFiscalProvider {
	return fiscalProvedor === "SPEDY" ? new SpedyFiscalProvider() : new ManualFiscalProvider();
}

function serializeJson(value: unknown) {
	return value === undefined || value === null ? null : JSON.stringify(value);
}

export async function findFiscalDocumentByReference({ organizacaoId, referencia }: { organizacaoId: string; referencia: string }) {
	return db.query.fiscalOutboundDocuments.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.organizacaoId, organizacaoId), operators.eq(fields.referencia, referencia)),
	});
}

type GetFiscalDocumentByIdParams = {
	documentId: string;
	organizationId: string;
};
export async function getFiscalDocumentById({ documentId, organizationId }: GetFiscalDocumentByIdParams) {
	return db.query.fiscalOutboundDocuments.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, documentId), operators.eq(fields.organizacaoId, organizationId)),
	});
}

export async function getFiscalDocumentDetailsById({ documentId, organizationId }: GetFiscalDocumentByIdParams) {
	return db.query.fiscalOutboundDocuments.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, documentId), operators.eq(fields.organizacaoId, organizationId)),
		with: {
			venda: {
				columns: {
					id: true,
					valorTotal: true,
					dataVenda: true,
					statusVenda: true,
					canal: true,
					entregaModalidade: true,
				},
				with: {
					cliente: {
						columns: {
							id: true,
							nome: true,
							cpfCnpj: true,
							telefone: true,
						},
					},
					itens: true,
				},
			},
			autorPresencaConsumidor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
			documentoOrigem: {
				columns: {
					id: true,
					numero: true,
					tipo: true,
					chaveAcesso: true,
				},
			},
		},
	});
}
export async function listFiscalDocuments({
	organizacaoId,
	page = 1,
	search,
	statusInterno,
}: {
	organizacaoId: string;
	page?: number;
	search?: string | null;
	statusInterno?: string[] | null;
}) {
	const PAGE_SIZE = 25;
	const offset = (page - 1) * PAGE_SIZE;
	const searchLike = search?.trim() ? `%${search.trim()}%` : null;

	const conditions = [eq(fiscalOutboundDocuments.organizacaoId, organizacaoId)];
	if (searchLike)
		conditions.push(sql`(${fiscalOutboundDocuments.referencia} ilike ${searchLike} or ${fiscalOutboundDocuments.chaveAcesso} ilike ${searchLike})`);
	if (statusInterno && statusInterno.length > 0) {
		conditions.push(
			inArray(fiscalOutboundDocuments.statusInterno, statusInterno as (typeof fiscalOutboundDocuments.statusInterno.enumValues)[number][]),
		);
	}
	const whereClause = and(...conditions);

	const [documents, [{ count }]] = await Promise.all([
		db.query.fiscalOutboundDocuments.findMany({
			where: whereClause,
			with: {
				venda: {
					columns: {
						id: true,
						valorTotal: true,
						dataVenda: true,
						statusVenda: true,
						entregaModalidade: true,
					},
					with: {
						cliente: {
							columns: { nome: true },
						},
					},
				},
			},
			orderBy: (fields, operators) => operators.desc(fields.dataInsercao),
			offset,
			limit: PAGE_SIZE,
		}),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(fiscalOutboundDocuments)
			.where(whereClause),
	]);

	return {
		documents,
		documentsMatched: count ?? 0,
		totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
	};
}

type ListFiscalDocumentEventsParams = {
	documentId: string;
	organizationId: string;
};
export async function listFiscalDocumentEvents({ documentId, organizationId }: ListFiscalDocumentEventsParams) {
	const documentBelongsToOrganization = await db.query.fiscalOutboundDocuments.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, documentId), operators.eq(fields.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!documentBelongsToOrganization) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");
	return db.query.fiscalDocumentEvents.findMany({
		where: (fields, operators) => operators.eq(fields.documentoFiscalId, documentId),
		orderBy: (fields, operators) => operators.desc(fields.dataInsercao),
		with: {
			autor: {
				columns: { id: true, nome: true, avatarUrl: true },
			},
		},
	});
}

async function patchFiscalDocument(documentoId: string, patch: Partial<typeof fiscalOutboundDocuments.$inferInsert>) {
	const [updated] = await db.update(fiscalOutboundDocuments).set(patch).where(eq(fiscalOutboundDocuments.id, documentoId)).returning();
	return updated;
}

// Apos esse tempo, um lock e considerado obsoleto (processo anterior morreu) e pode ser reclamado.
const FISCAL_SEND_LOCK_STALE_MINUTES = 15;

// Claim atomico do documento para envio ao provedor: marca bloqueadoEm somente se estiver livre
// ou com lock obsoleto. Compartilhado pela emissao manual e pelo worker da fila para impedir
// duas chamadas simultaneas ao provedor para o mesmo documento.
export async function claimFiscalDocumentForSend(documentId: string): Promise<boolean> {
	const staleThreshold = new Date(Date.now() - FISCAL_SEND_LOCK_STALE_MINUTES * 60_000);
	const claimed = await db
		.update(fiscalOutboundDocuments)
		.set({ bloqueadoEm: new Date() })
		.where(
			and(
				eq(fiscalOutboundDocuments.id, documentId),
				or(isNull(fiscalOutboundDocuments.bloqueadoEm), lte(fiscalOutboundDocuments.bloqueadoEm, staleThreshold)),
			),
		)
		.returning({ id: fiscalOutboundDocuments.id });
	return claimed.length > 0;
}

async function releaseFiscalDocumentSendLock(documentId: string) {
	await db.update(fiscalOutboundDocuments).set({ bloqueadoEm: null }).where(eq(fiscalOutboundDocuments.id, documentId));
}

async function addFiscalDocumentEvent({
	documentoFiscalId,
	tipo,
	descricao,
	payload,
	autorId,
	origem,
	provedorEventoId,
}: {
	documentoFiscalId: string;
	tipo: typeof fiscalDocumentEvents.$inferInsert.tipo;
	descricao?: string | null;
	payload?: unknown;
	autorId?: string | null;
	origem?: string | null;
	provedorEventoId?: string | null;
}) {
	const [event] = await db
		.insert(fiscalDocumentEvents)
		.values({
			documentoFiscalId,
			tipo,
			descricao: descricao ?? null,
			payload: serializeJson(payload),
			autorId: autorId ?? null,
			origem: origem ?? null,
			provedorEventoId: provedorEventoId ?? null,
		})
		.onConflictDoNothing()
		.returning();
	return event;
}

// Rejeicao/erro devolvido pelo provedor: com cStat vira problema SEFAZ catalogado; sem codigo,
// a mensagem e classificada por padrao (instabilidade, credenciais, payload recusado).
function buildProviderOutcomeProblems(codigoStatus: string | null | undefined, messages: string[]): TFiscalProblem[] {
	if (codigoStatus) return [buildSefazProblem(codigoStatus, messages[0] ?? null)];
	if (messages.length === 0)
		return [
			buildFiscalProblem("ERRO_DESCONHECIDO", {
				mensagem: "O provedor não informou o motivo da falha.",
			}),
		];
	return messages.flatMap((message) => toFiscalProblemsFromError(null, message));
}

async function applyProviderDocumentDetails(documentoId: string, details: TProviderDocumentDetails) {
	const current = await db.query.fiscalOutboundDocuments.findFirst({
		where: (fields, operators) => operators.eq(fields.id, documentoId),
	});
	if (!current) return { document: undefined, applied: false, ignored: true, rejectionPreserved: false };

	if (
		!shouldApplyProviderSnapshot({
			current,
			incoming: details,
		})
	) {
		const [touched] = await db
			.update(fiscalOutboundDocuments)
			.set({ dataUltimaSincronizacao: new Date() })
			.where(eq(fiscalOutboundDocuments.id, documentoId))
			.returning();
		return { document: touched ?? current, applied: false, ignored: true, rejectionPreserved: false };
	}

	const providerMessages = (details.mensagens ?? []).map((message) =>
		typeof message === "string" ? message : (JSON.stringify(message) ?? String(message)),
	);
	const rejectionPatch: Partial<typeof fiscalOutboundDocuments.$inferInsert> = {};
	let rejectionPreserved = false;
	if (["AUTORIZADO", "CANCELADO", "INUTILIZADO"].includes(details.statusInterno)) {
		rejectionPatch.codigoRejeicao = null;
		rejectionPatch.mensagens = [];
		rejectionPatch.problemas = null;
	} else if (
		(details.statusInterno === "REJEITADO" || details.statusInterno === "ERRO") &&
		shouldReplaceActionableRejection({
			currentCode: current.codigoRejeicao,
			incomingCode: details.codigoStatus,
			incomingMessages: providerMessages,
		})
	) {
		rejectionPatch.codigoRejeicao = details.codigoStatus ?? null;
		rejectionPatch.mensagens = providerMessages;
		rejectionPatch.problemas = serializeFiscalProblems(buildProviderOutcomeProblems(details.codigoStatus, providerMessages));
	} else if (details.statusInterno === "REJEITADO" || details.statusInterno === "ERRO") {
		rejectionPreserved = Boolean(current.codigoRejeicao || current.mensagens?.length);
	}

	// Retornos parciais do provedor (ex.: cancelamento nao traz chave/numero/datas de emissao):
	// campos ausentes ficam undefined e sao ignorados pelo update, preservando o valor persistido.
	const patch: Partial<typeof fiscalOutboundDocuments.$inferInsert> = {
		status: details.status,
		statusInterno: details.statusInterno,
		ambiente: details.ambiente,
		provedorDocumentoId: details.id,
		provedorStatus: details.status,
		chaveAcesso: details.chaveAcesso ?? undefined,
		numero: details.numero ?? undefined,
		serie: details.serie ?? undefined,
		protocolo: details.protocolo ?? undefined,
		...rejectionPatch,
		provedorPayload: serializeJson(details.provedorPayload) ?? undefined,
		provedorRetorno: serializeJson(details.provedorRetorno) ?? undefined,
		dataEmissao: details.dataEmissao ?? undefined,
		dataAutorizacao: details.dataAutorizacao ?? undefined,
		dataCancelamento: details.dataCancelamento ?? undefined,
		provedorProcessadoEm: details.provedorProcessadoEm ?? undefined,
		dataUltimaSincronizacao: new Date(),
	};

	const incomingStatus = details.statusInterno;
	const guards = [eq(fiscalOutboundDocuments.id, documentoId)];
	if (details.provedorProcessadoEm) {
		guards.push(
			or(isNull(fiscalOutboundDocuments.provedorProcessadoEm), lte(fiscalOutboundDocuments.provedorProcessadoEm, details.provedorProcessadoEm))!,
		);
	}
	if (!["AUTORIZADO", "CANCELADO", "INUTILIZADO"].includes(incomingStatus)) {
		guards.push(sql`${fiscalOutboundDocuments.statusInterno} not in ('AUTORIZADO', 'CANCELADO', 'INUTILIZADO')`);
	} else if (incomingStatus === "AUTORIZADO") {
		guards.push(sql`${fiscalOutboundDocuments.statusInterno} not in ('CANCELADO', 'INUTILIZADO')`);
	} else if (incomingStatus === "CANCELADO") {
		guards.push(sql`${fiscalOutboundDocuments.statusInterno} <> 'INUTILIZADO'`);
	} else {
		guards.push(sql`${fiscalOutboundDocuments.statusInterno} <> 'CANCELADO'`);
	}

	const [updated] = await db
		.update(fiscalOutboundDocuments)
		.set(patch)
		.where(and(...guards))
		.returning();
	if (!updated) {
		const latest = await db.query.fiscalOutboundDocuments.findFirst({
			where: (fields, operators) => operators.eq(fields.id, documentoId),
		});
		return { document: latest ?? current, applied: false, ignored: true, rejectionPreserved };
	}
	const stateChanged =
		current.statusInterno !== updated.statusInterno ||
		current.provedorStatus !== updated.provedorStatus ||
		current.codigoRejeicao !== updated.codigoRejeicao ||
		JSON.stringify(current.mensagens ?? []) !== JSON.stringify(updated.mensagens ?? []) ||
		current.chaveAcesso !== updated.chaveAcesso ||
		current.protocolo !== updated.protocolo;
	return { document: updated, applied: stateChanged, ignored: false, rejectionPreserved };
}

export async function applyFiscalProviderWebhookSnapshot({
	organizationId,
	documentId,
	details,
	providerEventId,
}: {
	organizationId: string;
	documentId: string;
	details: TProviderDocumentDetails;
	providerEventId?: string | null;
}) {
	const document = await getFiscalDocumentById({ documentId, organizationId });
	if (!document) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const result = await applyProviderDocumentDetails(document.id, details);
	const providerMessages = (details.mensagens ?? []).map((message) =>
		typeof message === "string" ? message : (JSON.stringify(message) ?? String(message)),
	);
	const auditOnly = result.ignored || result.rejectionPreserved || !result.applied;
	await addFiscalDocumentEvent({
		documentoFiscalId: document.id,
		tipo: auditOnly ? "SINCRONIZADO" : classifyFiscalDocumentEvent(details.statusInterno),
		descricao: result.ignored
			? "Atualizacao do provedor ignorada por ser anterior ao estado fiscal ja persistido."
			: result.rejectionPreserved
				? "Resposta secundaria do provedor registrada sem substituir a rejeicao fiscal acionavel."
				: !result.applied
					? "Webhook do provedor recebido sem alteracao do estado fiscal."
					: describeFiscalEmissionResult({
							status: details.statusInterno,
							messages: providerMessages,
						}),
		payload: details.provedorRetorno,
		origem: "WEBHOOK",
		provedorEventoId: providerEventId ?? null,
	});

	if (details.statusInterno === "AUTORIZADO" && result.document) {
		await persistAuthorizedAssets(result.document, organizationId);
	}
	return result.document;
}

async function createOrUpdateDraftDocument({
	input,
	referencia,
	statusInterno,
}: {
	input: TEmitirDocumentoInput;
	referencia: string;
	statusInterno: "RASCUNHO" | "PRONTO_PARA_ENVIO";
}) {
	const existing = await findFiscalDocumentByReference({
		organizacaoId: input.organizacaoId,
		referencia,
	});
	if (existing) return existing;

	const [inserted] = await db
		.insert(fiscalOutboundDocuments)
		.values({
			organizacaoId: input.organizacaoId,
			vendaId: input.vendaId,
			lancamentoContabilId: input.lancamentoContabilId ?? null,
			tipo: input.tipo,
			status: "PENDENTE",
			statusInterno,
			referencia,
			documentoOrigemId: input.documentoOrigemId ?? null,
			chaveAcessoReferencia: input.chaveAcessoReferencia ?? null,
		})
		.onConflictDoNothing({
			target: [fiscalOutboundDocuments.organizacaoId, fiscalOutboundDocuments.referencia],
		})
		.returning();
	if (inserted) return inserted;

	// Outra requisicao inseriu a mesma referencia entre o find e o insert: usa o registro vencedor.
	const winner = await findFiscalDocumentByReference({
		organizacaoId: input.organizacaoId,
		referencia,
	});
	if (!winner) throw new createHttpError.InternalServerError("Erro ao criar o documento fiscal.");
	return winner;
}

type LoadSaleForFiscalParams = {
	saleId: string;
	organizationId: string;
};
async function loadSaleForFiscal({ saleId, organizationId }: LoadSaleForFiscalParams): Promise<TSaleForFiscal | null> {
	const sale = await db.query.sales.findFirst({
		where: (fields, operators) => operators.and(operators.eq(fields.id, saleId), operators.eq(fields.organizacaoId, organizationId)),
		with: {
			itens: true,
			cliente: true,
			entregaLocalizacao: true,
		},
	});

	return sale ?? null;
}

async function loadProductFiscalProfilesForSale(venda: TSaleForFiscal) {
	if (venda.itens.length === 0) return [];
	const produtoIds = [...new Set(venda.itens.map((item) => item.produtoId))];
	return db.query.productFiscalProfiles.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, venda.organizacaoId ?? ""),
				operators.inArray(fields.produtoId, produtoIds),
				operators.isNull(fields.produtoVarianteId),
			),
	});
}

async function loadSalePayments({ saleId, organizationId }: { saleId: string; organizationId: string }) {
	const entries = await db.query.accountingEntries.findMany({
		where: (fields, operators) => operators.and(operators.eq(fields.vendaId, saleId), operators.eq(fields.organizacaoId, organizationId)),
		columns: { id: true },
		with: {
			transacoesFinanceiras: {
				columns: {
					valor: true,
					tipo: true,
					metodo: true,
					provedorStatus: true,
					modificadoresMetadata: true,
				},
			},
		},
	});

	const transactions = entries.flatMap((entry) => entry.transacoesFinanceiras);
	const totalsByMethod = new Map<TFiscalSalePayment["metodo"], number>();
	for (const transaction of transactions) {
		if (transaction.tipo !== "ENTRADA") continue;
		if (["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "")) continue;
		totalsByMethod.set(transaction.metodo, (totalsByMethod.get(transaction.metodo) ?? 0) + transaction.valor);
	}

	const payments = [...totalsByMethod.entries()].map(([metodo, valor]) => ({
		metodo,
		valor: Math.round((valor + Number.EPSILON) * 100) / 100,
	}));
	// Os recebimentos ficam pelo valor entregue pelo cliente (R$ 50 numa venda de R$ 37) e o troco
	// e uma SAIDA do mesmo lancamento. A Spedy nao expoe vTroco e pagamentos acima do total sao a
	// rejeicao 866: a visao fiscal sai liquida do troco, fechando exatamente no valor da venda.
	return netSaleChangeFromPayments(payments, getSaleChangeTotal(transactions));
}
async function loadTaxGroupsForProfiles(perfisProdutos: { grupoTributarioId: string | null }[]): Promise<TFiscalTaxGroupWithRules[]> {
	const grupoIds = [...new Set(perfisProdutos.map((perfil) => perfil.grupoTributarioId).filter((id): id is string => !!id))];
	if (grupoIds.length === 0) return [];
	return db.query.fiscalTaxGroups.findMany({
		where: (fields) => inArray(fields.id, grupoIds),
		with: { regras: true },
	});
}

async function loadIbptRatesForSale({ perfisProdutos, uf }: { perfisProdutos: { ncm: string }[]; uf: string | null | undefined }) {
	if (!uf) return [];
	const ncms = [...new Set(perfisProdutos.map((perfil) => perfil.ncm).filter((ncm): ncm is string => !!ncm))];
	if (ncms.length === 0) return [];
	return db.query.fiscalIbptRates.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.uf, uf.toUpperCase()),
				operators.inArray(fields.ncm, ncms),
				// Ignora versoes da tabela IBPT com vigencia encerrada.
				operators.or(operators.isNull(fields.vigenciaFim), operators.gte(fields.vigenciaFim, new Date())),
			),
		orderBy: (fields, operators) => operators.desc(fields.vigenciaInicio),
	});
}

function buildDestinatarioSnapshot(venda: TSaleForFiscal | null) {
	if (!venda?.cliente) return null;
	const address = venda.entregaLocalizacao ?? venda.cliente;
	return {
		nome: venda.cliente.nome,
		cpfCnpj: venda.cliente.cpfCnpj,
		inscricaoEstadual: venda.cliente.inscricaoEstadual,
		indicadorInscricaoEstadual: venda.cliente.indicadorInscricaoEstadual,
		email: venda.cliente.email,
		endereco: {
			cep: address?.localizacaoCep ?? null,
			estado: address?.localizacaoEstado ?? null,
			cidade: address?.localizacaoCidade ?? null,
			bairro: address?.localizacaoBairro ?? null,
			logradouro: address?.localizacaoLogradouro ?? null,
			numero: address?.localizacaoNumero ?? null,
			complemento: address?.localizacaoComplemento ?? null,
		},
	};
}

// Erro de prontidao com o problema estruturado embutido: a mensagem continua a mesma para o
// historico, e o problema (codigo + alvo) e o que a UI transforma em CTA.
function readinessError(message: string, code: Parameters<typeof buildFiscalProblem>[0], alvo?: Partial<TFiscalProblem["alvo"]>) {
	return new FiscalReadinessError(message, [buildFiscalProblem(code, { mensagem: message, alvo })]);
}

function assertFiscalReadiness(context: TFiscalSaleContext) {
	const fiscalConfig = context.organizacao.fiscalConfiguracao;
	if (!fiscalConfig) throw readinessError("Configuracao fiscal da organizacao nao encontrada.", "CONFIGURACAO_FISCAL_INCOMPLETA");
	if (!context.serie?.id) throw readinessError("Serie fiscal ativa nao encontrada para esta emissao.", "SERIE_AUSENTE");
	if (!context.operacao?.id) throw readinessError("Perfil de operacao fiscal nao encontrado para esta emissao.", "PERFIL_OPERACAO_AUSENTE");
	if (!fiscalConfig.cpfCnpj) throw readinessError("CPF/CNPJ fiscal da organizacao nao configurado.", "CONFIGURACAO_FISCAL_INCOMPLETA");
	if (!fiscalConfig.nomeRazaoSocial) throw readinessError("Razao social fiscal da organizacao nao configurada.", "CONFIGURACAO_FISCAL_INCOMPLETA");
	if (
		context.venda.entregaModalidade === "ENTREGA" &&
		!isValidCpfCnpj(context.venda.cliente?.cpfCnpj ?? "") &&
		!context.classificacaoPresencaExcepcional
	) {
		throw readinessError("Informe um CPF ou CNPJ valido para o destinatario da entrega antes de emitir o documento fiscal.", "CLIENTE_SEM_DOCUMENTO", {
			id: context.venda.cliente?.id ?? context.venda.clienteId ?? null,
			rotulo: context.venda.cliente?.nome ?? null,
		});
	}

	// CSC/token e companyApiKey sao credenciais da emissao via Spedy; no provedor MANUAL nao ha envio.
	if (context.organizacao.fiscalProvedor === "SPEDY") {
		if (!fiscalConfig.spedy?.companyApiKey) throw readinessError("Empresa fiscal nao sincronizada com a Spedy.", "EMPRESA_PROVEDOR_NAO_SINCRONIZADA");
		if (context.operacao.tipoDocumento === "NFCE") {
			if (!fiscalConfig.spedy?.nfce?.csc) throw readinessError("CSC da NFC-e nao configurado.", "NFCE_CREDENCIAIS_AUSENTES");
			if (!fiscalConfig.spedy?.nfce?.tokenId) throw readinessError("Token da NFC-e nao configurado.", "NFCE_CREDENCIAIS_AUSENTES");
		}
	}
	if (context.operacao.finalidade !== "DEVOLUCAO" && context.pagamentos.length > 0) {
		const paymentTotal = context.pagamentos.reduce((total, payment) => total + payment.valor, 0);
		// A visao fiscal ja sai liquida do troco (loadSalePayments); bloqueia apenas pagamento insuficiente.
		if (paymentTotal + 0.01 < context.venda.valorTotal) {
			throw readinessError("A soma dos pagamentos e menor que o valor total da venda.", "PAGAMENTOS_INSUFICIENTES", { id: context.venda.id });
		}
	}

	if (context.perfisProdutos.length === 0) {
		// Nenhum item tem perfil: um problema por produto, para a UI oferecer o cadastro de cada um.
		const produtos = new Map<string, string | null>();
		for (const item of context.venda.itens) produtos.set(item.produtoId, resolveSaleItemLabel(item.metadados));
		throw new FiscalReadinessError(
			"Nenhum perfil fiscal de produto encontrado para a venda.",
			[...produtos.entries()].map(([produtoId, rotulo]) =>
				buildFiscalProblem("PERFIL_FISCAL_AUSENTE", {
					mensagem: rotulo ? `${rotulo}: produto sem perfil fiscal cadastrado.` : "Produto sem perfil fiscal cadastrado.",
					alvo: { tipo: "PRODUTO", id: produtoId, rotulo },
				}),
			),
		);
	}
}

function resolveSaleItemLabel(metadados: unknown): string | null {
	if (!metadados || typeof metadados !== "object") return null;
	const record = metadados as Record<string, unknown>;
	for (const key of ["nomeProduto", "descricao", "nome"]) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return null;
}

function buildSaleProductLabelResolver(context: TFiscalSaleContext) {
	const labels = new Map<string, string | null>();
	for (const item of context.venda.itens) {
		if (!labels.has(item.produtoId)) labels.set(item.produtoId, resolveSaleItemLabel(item.metadados));
	}
	return (produtoId: string) => labels.get(produtoId) ?? null;
}

async function buildSaleFiscalContext(input: TEmitirDocumentoInput): Promise<TFiscalSaleContext> {
	const venda = await loadSaleForFiscal({
		saleId: input.vendaId,
		organizationId: input.organizacaoId,
	});
	if (!venda) throw new createHttpError.NotFound("Venda nao encontrada para emissao fiscal.");

	const organizacao = await loadFiscalOrganization(input.organizacaoId);
	if (!organizacao) throw new createHttpError.NotFound("Organizacao nao encontrada para emissao fiscal.");
	if (input.classificacaoPresencaExcepcional) {
		if (input.origem !== "MANUAL") {
			throw new FiscalReadinessError("A classificacao presencial excepcional exige emissao manual.");
		}
		if (venda.entregaModalidade !== "ENTREGA") {
			throw new FiscalReadinessError("A classificacao presencial excepcional esta disponivel somente para vendas com entrega.");
		}
		if (!organizacao.fiscalConfiguracao?.emissaoManual?.classificacaoPresencialExcepcional?.habilitada) {
			throw new FiscalReadinessError("A classificacao presencial excepcional nao esta habilitada para esta organizacao.");
		}
		const justificationLength = input.classificacaoPresencaExcepcional.justificativa.trim().length;
		if (justificationLength < EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH || justificationLength > EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH) {
			throw new FiscalReadinessError("A justificativa da classificacao presencial excepcional possui tamanho invalido.");
		}
	}

	const ambiente = organizacao.fiscalConfiguracao?.ambiente ?? "HOMOLOGACAO";
	const resolvedOperation = await resolveOperationProfileForSale({
		organizacaoId: input.organizacaoId,
		tipoDocumento: input.tipo,
		signals: {
			canal: venda.canal,
			entregaModalidade: venda.entregaModalidade,
		},
		operationProfileId: input.operationProfileId,
		operacaoPadraoPorTipoId: organizacao.fiscalConfiguracao?.operacaoPadraoPorTipo?.[input.tipo] ?? null,
		// Documento encadeado a um original e sempre devolucao: garante o perfil DEVOLUCAO
		// mesmo quando o operationProfileId nao foi repassado (ex.: retentativa via worker).
		finalidade: input.documentoOrigemId ? "DEVOLUCAO" : "NORMAL",
	});
	const operacao = input.classificacaoPresencaExcepcional
		? {
				...resolvedOperation,
				presencaConsumidor: input.classificacaoPresencaExcepcional.presencaConsumidor,
			}
		: resolvedOperation;

	const serie =
		operacao.seriePadrao ??
		(await findActiveFiscalSeries({
			organizacaoId: input.organizacaoId,
			tipoDocumento: input.tipo,
			ambiente,
		}));
	if (!serie) throw readinessError("Serie fiscal nao configurada.", "SERIE_AUSENTE");

	const [perfisProdutos, pagamentos] = await Promise.all([
		loadProductFiscalProfilesForSale(venda),
		loadSalePayments({ saleId: venda.id, organizationId: input.organizacaoId }),
	]);
	const gruposTributarios = await loadTaxGroupsForProfiles(perfisProdutos);
	const ibptRates = await loadIbptRatesForSale({
		perfisProdutos,
		uf: organizacao.fiscalConfiguracao?.endereco.uf,
	});

	return {
		venda,
		organizacao,
		serie,
		operacao,
		perfisProdutos,
		gruposTributarios,
		ibptRates,
		destinatarioSnapshot: buildDestinatarioSnapshot(venda),
		pagamentos,
		classificacaoPresencaExcepcional: input.classificacaoPresencaExcepcional ?? null,
	};
}

// Validacao tributaria local (motor fiscal) antes de enviar ao provedor.
// Bloqueia a emissao quando ha erros impeditivos detectaveis sem custo de rejeicao SEFAZ.
function assertFiscalTaxationValid(context: TFiscalSaleContext) {
	const taxation = computeSaleTaxation(context);
	if (hasBlockingErrors(taxation.erros)) {
		throw new FiscalReadinessError(
			`Validacao fiscal falhou: ${formatValidationMessages(taxation.erros).join("; ")}`,
			buildValidationProblems(taxation.erros, buildSaleProductLabelResolver(context)),
		);
	}
	// Pagamentos conferidos contra o vNF que o payload declara — nao contra venda.valorTotal.
	// Era exatamente essa divergencia (guarda no liquido, nota no bruto) que deixava passar a
	// rejeicao 865 quando um desconto de cabecalho nao chegava ao vDesc. Canal gerenciado fica
	// fora: buildFiscalPaymentsForManagedSale reconstroi os pagamentos para somar o vNF.
	if (!context.venda.integracaoMetadados && context.operacao.finalidade !== "DEVOLUCAO" && context.pagamentos.length > 0) {
		const paymentTotal = context.pagamentos.reduce((total, payment) => total + payment.valor, 0);
		if (paymentTotal + 0.01 < taxation.totais.vNF) {
			throw readinessError(
				"A soma dos pagamentos e menor que o total do documento fiscal (vNF). A SEFAZ rejeitaria a nota (865); confira descontos e pagamentos da venda.",
				"PAGAMENTOS_INSUFICIENTES",
				{ id: context.venda.id },
			);
		}
	}
}

async function persistAuthorizedAssets(documento: typeof fiscalOutboundDocuments.$inferSelect, organizacaoId: string) {
	if (documento.xmlStoragePath && documento.pdfStoragePath) return documento;
	const organizacao = await loadFiscalOrganization(organizacaoId);
	if (!organizacao) return null;
	const provider = resolveFiscalProvider(organizacao.fiscalProvedor);
	const [xmlBuffer, pdfBuffer] = await Promise.all([
		documento.xmlStoragePath ? null : provider.baixarXml(documento, organizacao),
		documento.pdfStoragePath ? null : provider.baixarPdf(documento, organizacao),
	]);
	const xmlStoragePath = xmlBuffer
		? await storeFiscalAsset({
				documentoId: documento.id,
				tipo: documento.tipo,
				asset: "xml",
				buffer: xmlBuffer,
			})
		: null;
	const pdfStoragePath = pdfBuffer
		? await storeFiscalAsset({
				documentoId: documento.id,
				tipo: documento.tipo,
				asset: "pdf",
				buffer: pdfBuffer,
			})
		: null;
	const patched = await patchFiscalDocument(documento.id, {
		xmlStoragePath: xmlStoragePath ?? undefined,
		pdfStoragePath: pdfStoragePath ?? undefined,
	});
	// Auto-print da DANFE: hook único para os dois caminhos de autorização (emissão e sync),
	// depois do pdfStoragePath gravado. Nunca lança; idempotente por DANFE:<documentoId>.
	if (patched?.pdfStoragePath) {
		await processFiscalDocumentDanfeAutoPrintIfEligible({ documento: patched });
	}
	return patched;
}

// Parte "preparar": cria/atualiza o rascunho, valida prontidao e tributacao, reserva numeracao
// e marca PRONTO_PARA_ENVIO. NAO chama o provedor. Compartilhada pela emissao sincrona e pela fila.
async function prepareFiscalDocumentForSend({
	input,
	documento,
	referencia,
}: {
	input: TEmitirDocumentoInput;
	documento: typeof fiscalOutboundDocuments.$inferSelect;
	referencia: string;
}): Promise<TFiscalSaleContext> {
	if (input.classificacaoPresencaExcepcional) {
		await patchFiscalDocument(documento.id, {
			presencaConsumidorDeclarada: input.classificacaoPresencaExcepcional.presencaConsumidor,
			justificativaPresencaConsumidor: input.classificacaoPresencaExcepcional.justificativa,
			autorPresencaConsumidorId: input.classificacaoPresencaExcepcional.autorId,
			dataDeclaracaoPresencaConsumidor: input.classificacaoPresencaExcepcional.dataDeclaracao,
			proximaTentativaEm: null,
		});
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "CLASSIFICACAO_PRESENCA_EXCEPCIONAL",
			descricao: "Venda com entrega declarada excepcionalmente como operação presencial para esta tentativa manual.",
			payload: {
				presencaConsumidor: input.classificacaoPresencaExcepcional.presencaConsumidor,
				justificativa: input.classificacaoPresencaExcepcional.justificativa,
			},
			autorId: input.classificacaoPresencaExcepcional.autorId,
		});
	} else if (documento.presencaConsumidorDeclarada) {
		await patchFiscalDocument(documento.id, {
			presencaConsumidorDeclarada: null,
			justificativaPresencaConsumidor: null,
			autorPresencaConsumidorId: null,
			dataDeclaracaoPresencaConsumidor: null,
		});
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "CLASSIFICACAO_PRESENCA_EXCEPCIONAL",
			descricao: "Classificação presencial excepcional removida antes de uma nova tentativa de emissão.",
			payload: { ativa: false },
			autorId: input.autorId ?? null,
		});
	}
	const context = await buildSaleFiscalContext(input);
	assertFiscalReadiness(context);
	assertFiscalTaxationValid(context);
	// Rejeicoes nao-reenviaveis (ex.: 204/539, duplicidade) exigem numeracao nova: reutilizar
	// o mesmo numero repetiria a mesma rejeicao indefinidamente.
	const rejectionInfo = getFiscalRejectionInfo(documento.codigoRejeicao);
	const mustAdvanceNumber = !!documento.numero && !!rejectionInfo && !rejectionInfo.reenviavel;
	const reservedNumber = documento.numero && !mustAdvanceNumber ? Number(documento.numero) : await reserveFiscalSeriesNumber(context.serie.id);

	await patchFiscalDocument(documento.id, {
		codigoRejeicao: null,
		problemas: null,
		statusInterno: "PRONTO_PARA_ENVIO",
		ambiente: context.organizacao.fiscalConfiguracao?.ambiente ?? "HOMOLOGACAO",
		referencia,
		provedor: context.organizacao.fiscalProvedor ?? "MANUAL",
		serie: context.serie.serie,
		numero: String(reservedNumber),
		snapshotOrigemVenda: JSON.stringify({
			venda: context.venda,
			destinatario: context.destinatarioSnapshot,
			classificacaoPresencaExcepcional: context.classificacaoPresencaExcepcional,
		}),
		tentativasEnvio: (documento.tentativasEnvio ?? 0) + 1,
	});

	await addFiscalDocumentEvent({
		documentoFiscalId: documento.id,
		tipo: "CRIADO",
		descricao: `Documento fiscal preparado para emissao ${input.origem.toLowerCase()}.`,
		autorId: input.autorId ?? null,
	});

	return context;
}

// Enfileira a emissao (preparar + agendar) sem chamar o provedor. Usada pelo fluxo de venda
// para nao acoplar a confirmacao a latencia/disponibilidade da SEFAZ. O worker faz o envio.
export async function enqueueFiscalDocument(input: TEmitirDocumentoInput) {
	if (input.classificacaoPresencaExcepcional) {
		throw new createHttpError.BadRequest("A classificação presencial excepcional não pode ser enfileirada para emissão automática.");
	}
	const referencia = buildFiscalReference(input);
	const existing = await findFiscalDocumentByReference({
		organizacaoId: input.organizacaoId,
		referencia,
	});
	if (existing && ["AUTORIZADO", "EM_PROCESSAMENTO", "PRONTO_PARA_ENVIO"].includes(existing.statusInterno)) {
		return {
			documentoId: existing.id,
			status: existing.status,
			statusInterno: existing.statusInterno,
		};
	}

	const documento = await createOrUpdateDraftDocument({
		input,
		referencia,
		statusInterno: "RASCUNHO",
	});
	try {
		await prepareFiscalDocumentForSend({ input, documento, referencia });
		// Nao zera bloqueadoEm aqui: um lock ativo pertence a outro envio em andamento;
		// locks de processos mortos sao reclamados pelo claim apos ficarem obsoletos.
		await patchFiscalDocument(documento.id, { proximaTentativaEm: new Date() });
		return {
			documentoId: documento.id,
			status: "PENDENTE" as const,
			statusInterno: "PRONTO_PARA_ENVIO" as const,
		};
	} catch (error) {
		const message = getErrorMessage(error);
		await patchFiscalDocument(documento.id, {
			statusInterno: "ERRO",
			mensagens: [message],
			problemas: serializeFiscalProblems(toFiscalProblemsFromError(error, message)),
			proximaTentativaEm: null,
		});
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "ERRO",
			descricao: message,
			autorId: input.autorId ?? null,
		});
		throw error;
	}
}

export async function emitFiscalDocument(input: TEmitirDocumentoInput) {
	if (input.classificacaoPresencaExcepcional && input.origem !== "MANUAL") {
		throw new createHttpError.BadRequest("A classificação presencial excepcional só pode ser usada em uma emissão manual.");
	}
	const referencia = buildFiscalReference(input);
	const existing = await findFiscalDocumentByReference({
		organizacaoId: input.organizacaoId,
		referencia,
	});
	if (existing?.statusInterno === "AUTORIZADO" || existing?.statusInterno === "EM_PROCESSAMENTO") {
		return {
			documentoId: existing.id,
			status: existing.status,
			statusInterno: existing.statusInterno,
			chaveAcesso: existing.chaveAcesso,
			numero: existing.numero,
			serie: existing.serie,
			protocolo: existing.protocolo,
		};
	}
	if (input.origem !== "MANUAL" && existing?.presencaConsumidorDeclarada) {
		throw new createHttpError.BadRequest("Este documento exige uma nova confirmação manual da classificação presencial excepcional.");
	}

	const documento = await createOrUpdateDraftDocument({
		input,
		referencia,
		statusInterno: "RASCUNHO",
	});
	// Lock de envio compartilhado com a fila: se o worker (ou outra emissao manual) ja esta
	// processando este documento, nao dispara uma segunda chamada ao provedor.
	if (!(await claimFiscalDocumentForSend(documento.id))) {
		throw new createHttpError.Conflict("Documento fiscal ja esta sendo processado por outro envio. Aguarde e sincronize o documento.");
	}
	try {
		const context = await prepareFiscalDocumentForSend({
			input,
			documento,
			referencia,
		});

		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "ENVIO_SOLICITADO",
			descricao: "Envio ao provedor fiscal solicitado.",
			autorId: input.autorId ?? null,
		});

		const provider = resolveFiscalProvider(context.organizacao.fiscalProvedor);
		const latestDocument =
			(await findFiscalDocumentByReference({
				organizacaoId: input.organizacaoId,
				referencia,
			})) ?? documento;
		const providerDetails = await provider.emitirDocumento(context, latestDocument);
		const providerApplication = await applyProviderDocumentDetails(documento.id, providerDetails);
		const updatedDocument = providerApplication.document;

		const providerMessages = (providerDetails.mensagens ?? []).map((message) =>
			typeof message === "string" ? message : (JSON.stringify(message) ?? String(message)),
		);
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: classifyFiscalDocumentEvent(providerDetails.statusInterno),
			descricao: describeFiscalEmissionResult({
				status: providerDetails.statusInterno,
				messages: providerMessages,
			}),
			payload: providerDetails.provedorRetorno,
			autorId: input.autorId ?? null,
			origem: "EMISSAO",
		});

		if (providerDetails.statusInterno === "REJEITADO" || providerDetails.statusInterno === "ERRO") {
			console.warn("[FISCAL] Emissao fiscal finalizada sem autorizacao", {
				documentoFiscalId: documento.id,
				vendaId: input.vendaId,
				tipo: input.tipo,
				statusInterno: providerDetails.statusInterno,
				codigoRejeicao: providerDetails.codigoStatus,
				mensagens: providerMessages,
				provedorDocumentoId: providerDetails.id,
			});
		}

		if (providerDetails.statusInterno === "AUTORIZADO" && updatedDocument) {
			await persistAuthorizedAssets(updatedDocument, context.organizacao.id);
		}

		const finalDocument =
			updatedDocument ??
			(await findFiscalDocumentByReference({
				organizacaoId: input.organizacaoId,
				referencia,
			})) ??
			documento;
		return {
			documentoId: finalDocument.id,
			status: finalDocument.status,
			statusInterno: finalDocument.statusInterno,
			chaveAcesso: finalDocument.chaveAcesso,
			numero: finalDocument.numero,
			serie: finalDocument.serie,
			protocolo: finalDocument.protocolo,
		};
	} catch (error) {
		const message = getErrorMessage(error);
		await patchFiscalDocument(documento.id, {
			statusInterno: "ERRO",
			mensagens: [message],
			problemas: serializeFiscalProblems(toFiscalProblemsFromError(error, message)),
		});
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "ERRO",
			descricao: message,
			autorId: input.autorId ?? null,
		});
		throw error;
	} finally {
		await releaseFiscalDocumentSendLock(documento.id);
	}
}

export async function syncFiscalDocument(input: TSyncDocumentInput) {
	const documento = await getFiscalDocumentById({
		documentId: input.documentId,
		organizationId: input.organizationId,
	});
	if (!documento) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const organizacao = await loadFiscalOrganization(documento.organizacaoId);
	if (!organizacao) throw new createHttpError.NotFound("Organizacao do documento fiscal nao encontrada.");

	const provider = resolveFiscalProvider(organizacao.fiscalProvedor);
	const providerDetails = await provider.sincronizarDocumento(documento, organizacao);
	const providerApplication = await applyProviderDocumentDetails(documento.id, providerDetails);
	const updated = providerApplication.document;

	const syncMessages = (providerDetails.mensagens ?? []).map((message) =>
		typeof message === "string" ? message : (JSON.stringify(message) ?? String(message)),
	);
	const syncRejectionDetail =
		providerDetails.statusInterno === "REJEITADO" || providerDetails.statusInterno === "ERRO"
			? syncMessages.join("; ") || "sem motivo informado pelo provedor"
			: null;

	const syncSource = input.source ?? "CONSULTA_MANUAL";
	if (providerApplication.applied) {
		await addFiscalDocumentEvent({
			documentoFiscalId: documento.id,
			tipo: "SINCRONIZADO",
			descricao: syncRejectionDetail
				? `Consulta ao provedor: documento ${providerDetails.statusInterno.toLowerCase()} — ${syncRejectionDetail}`
				: syncSource === "CONSULTA_AUTOMATICA"
					? "Status fiscal atualizado automaticamente a partir do provedor."
					: "Status fiscal atualizado a partir de uma consulta ao provedor.",
			payload: providerDetails.provedorRetorno,
			autorId: input.authorId ?? null,
			origem: syncSource,
		});
	}

	if (providerDetails.statusInterno === "REJEITADO" || providerDetails.statusInterno === "ERRO") {
		console.warn("[FISCAL] Sincronizacao fiscal sem autorizacao", {
			documentoFiscalId: documento.id,
			statusInterno: providerDetails.statusInterno,
			codigoRejeicao: providerDetails.codigoStatus,
			mensagens: syncMessages,
			provedorDocumentoId: providerDetails.id,
		});
	}

	if (providerDetails.statusInterno === "AUTORIZADO" && updated) {
		await persistAuthorizedAssets(updated, organizacao.id);
	}

	return {
		documentoId: updated?.id ?? documento.id,
		status: updated?.status ?? providerDetails.status,
		statusInterno: updated?.statusInterno ?? providerDetails.statusInterno,
	};
}

export async function cancelFiscalDocument(input: TCancelDocumentInput) {
	const documento = await getFiscalDocumentById({
		documentId: input.documentId,
		organizationId: input.organizationId,
	});
	if (!documento) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const organizacao = await loadFiscalOrganization(documento.organizacaoId);
	if (!organizacao) throw new createHttpError.NotFound("Organizacao do documento fiscal nao encontrada.");
	// Mesma regra da UI (status + janela legal): nao chama a SEFAZ para ouvir "nao".
	assertFiscalDocumentActionAvailable(await loadFiscalDocumentActions(documento, organizacao.fiscalProvedor), "CANCELAR");

	await addFiscalDocumentEvent({
		documentoFiscalId: documento.id,
		tipo: "CANCELAMENTO_SOLICITADO",
		descricao: input.reason,
		autorId: input.authorId ?? null,
	});

	const provider = resolveFiscalProvider(organizacao.fiscalProvedor);
	const providerDetails = await provider.cancelarDocumento(input, documento, organizacao);
	const providerApplication = await applyProviderDocumentDetails(documento.id, providerDetails);
	const updated = providerApplication.document;

	await addFiscalDocumentEvent({
		documentoFiscalId: documento.id,
		tipo: providerDetails.statusInterno === "CANCELADO" ? "CANCELADO" : "ERRO",
		descricao: providerDetails.statusInterno === "CANCELADO" ? "Documento cancelado com sucesso." : "Falha ao cancelar documento.",
		payload: providerDetails.provedorRetorno,
		autorId: input.authorId ?? null,
		origem: "CANCELAMENTO",
	});

	return {
		documentoId: updated?.id ?? documento.id,
		status: updated?.status ?? providerDetails.status,
		statusInterno: updated?.statusInterno ?? providerDetails.statusInterno,
	};
}

export async function registerFiscalCorrection(input: TFiscalCorrectionInput) {
	const documento = await getFiscalDocumentById({
		documentId: input.documentId,
		organizationId: input.organizationId,
	});
	if (!documento) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const organizacao = await loadFiscalOrganization(documento.organizacaoId);
	if (!organizacao) throw new createHttpError.NotFound("Organizacao do documento fiscal nao encontrada.");
	assertFiscalDocumentActionAvailable(await loadFiscalDocumentActions(documento, organizacao.fiscalProvedor), "CARTA_CORRECAO");

	const provider = resolveFiscalProvider(organizacao.fiscalProvedor);
	const result = await provider.cartaCorrecaoDocumento(input, documento, organizacao);

	await addFiscalDocumentEvent({
		documentoFiscalId: documento.id,
		tipo: "CARTA_CORRECAO",
		descricao: `Carta de correcao (sequencia ${result.sequenciaEvento}): ${input.correcao}`,
		payload: result.provedorRetorno,
		autorId: input.authorId ?? null,
	});

	return {
		documentoId: documento.id,
		sequenciaEvento: result.sequenciaEvento,
		protocolo: result.protocolo ?? null,
	};
}

export async function inutilizeFiscalDocument(input: TFiscalInutilizationInput) {
	const documento = await getFiscalDocumentById({
		documentId: input.documentId,
		organizationId: input.organizationId,
	});
	if (!documento) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const organizacao = await loadFiscalOrganization(documento.organizacaoId);
	if (!organizacao) throw new createHttpError.NotFound("Organizacao do documento fiscal nao encontrada.");
	assertFiscalDocumentActionAvailable(await loadFiscalDocumentActions(documento, organizacao.fiscalProvedor), "INUTILIZAR");

	const provider = resolveFiscalProvider(organizacao.fiscalProvedor);
	const result = await provider.inutilizarNumeracao(input, documento, organizacao);

	await patchFiscalDocument(documento.id, {
		status: result.status,
		statusInterno: "INUTILIZADO",
		proximaTentativaEm: null,
		bloqueadoEm: null,
	});
	await addFiscalDocumentEvent({
		documentoFiscalId: documento.id,
		tipo: "INUTILIZACAO",
		descricao: `Inutilizacao de numeracao: ${input.justificativa}`,
		payload: result.provedorRetorno,
		autorId: input.authorId ?? null,
	});

	return {
		documentoId: documento.id,
		status: result.status,
		protocolo: result.protocolo ?? null,
	};
}

type CreateReturnFiscalDocumentParams = {
	organizationId: string;
	originalDocumentId: string;
	operationProfileId?: string | null;
	authorId?: string | null;
};
// Gera uma NF-e de devolucao referenciando um documento autorizado (mesma venda, finalidade DEVOLUCAO).
export async function createReturnFiscalDocument({
	organizationId,
	originalDocumentId,
	operationProfileId,
	authorId,
}: CreateReturnFiscalDocumentParams) {
	const original = await getFiscalDocumentById({
		documentId: originalDocumentId,
		organizationId,
	});
	if (!original) throw new createHttpError.NotFound("Documento fiscal original nao encontrado.");
	const organizacao = await loadFiscalOrganization(organizationId);
	assertFiscalDocumentActionAvailable(await loadFiscalDocumentActions(original, organizacao?.fiscalProvedor), "DEVOLUCAO");
	// A matriz ja garante status AUTORIZADO, venda e chave; os narrows abaixo sao para o compilador.
	if (!original.vendaId || !original.chaveAcesso)
		throw new createHttpError.BadRequest("Documento original sem venda vinculada ou sem chave de acesso.");

	let profileId = operationProfileId ?? null;
	if (!profileId) {
		const devProfile = await db.query.fiscalOperationProfiles.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizacaoId, organizationId),
					operators.eq(fields.tipoDocumento, "NFE"),
					operators.eq(fields.finalidade, "DEVOLUCAO"),
					operators.eq(fields.ativo, true),
				),
		});
		if (!devProfile) throw new createHttpError.BadRequest("Configure um perfil de operacao fiscal de devolucao (NF-e com finalidade DEVOLUCAO).");
		profileId = devProfile.id;
	}

	return enqueueFiscalDocument({
		vendaId: original.vendaId,
		tipo: "NFE",
		organizacaoId: organizationId,
		autorId: authorId ?? null,
		origem: "MANUAL",
		operationProfileId: profileId,
		documentoOrigemId: original.id,
		chaveAcessoReferencia: original.chaveAcesso,
	});
}

/**
 * Nome do arquivo servido ao usuario. A chave de acesso e o nome canonico de um documento fiscal
 * no Brasil — e o que os sistemas de contabilidade esperam receber. Sem chave (nota ainda nao
 * autorizada), cai para tipo/serie/numero e, em ultimo caso, para o id.
 */
function buildFiscalAssetFileName(
	document: { id: string; tipo: string; serie: string | null; numero: string | null; chaveAcesso: string | null },
	asset: TFiscalAssetType,
) {
	const identifier = document.chaveAcesso ?? [document.tipo, document.serie, document.numero].filter(Boolean).join("-") ?? document.id;
	// Content-Disposition nao aceita qualquer byte no filename; a chave e so digito, mas o fallback
	// passa por campos livres.
	const safeIdentifier = identifier.replace(/[^A-Za-z0-9._-]/g, "-") || document.id;
	return `${safeIdentifier}.${asset}`;
}

type GetFiscalDocumentAssetParams = {
	documentId: string;
	organizationId: string;
	asset: TFiscalAssetType;
};
export async function getFiscalDocumentAsset({ documentId, organizationId, asset }: GetFiscalDocumentAssetParams) {
	const document = await getFiscalDocumentById({ documentId, organizationId });
	if (!document) throw new createHttpError.NotFound("Documento fiscal nao encontrado.");

	const fileName = buildFiscalAssetFileName(document, asset);

	const path = asset === "xml" ? document.xmlStoragePath : document.pdfStoragePath;
	if (path) {
		return {
			buffer: await downloadStoredFiscalAsset(path),
			contentType: getFiscalAssetContentType(asset),
			fileName,
		};
	}

	const organization = await loadFiscalOrganization(document.organizacaoId);
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const provider = resolveFiscalProvider(organization.fiscalProvedor);
	const buffer = asset === "xml" ? await provider.baixarXml(document, organization) : await provider.baixarPdf(document, organization);
	if (!buffer) throw new createHttpError.NotFound("Arquivo fiscal nao encontrado.");

	const storedPath = await storeFiscalAsset({
		documentoId: document.id,
		tipo: document.tipo,
		asset,
		buffer,
	});
	await patchFiscalDocument(document.id, asset === "xml" ? { xmlStoragePath: storedPath } : { pdfStoragePath: storedPath });

	return {
		buffer,
		contentType: getFiscalAssetContentType(asset),
		fileName,
	};
}

type SyncPendingFiscalDocumentsParams = {
	organizationId: string;
	limit?: number;
};
export async function syncPendingFiscalDocuments({ organizationId, limit = 20 }: SyncPendingFiscalDocumentsParams) {
	const pendingDocuments = await db.query.fiscalOutboundDocuments.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizacaoId, organizationId),
				operators.inArray(fields.statusInterno, ["EM_PROCESSAMENTO", "CANCELAMENTO_PENDENTE"]),
			),
		orderBy: (fields, operators) => operators.asc(fields.dataInsercao),
		limit,
	});

	const results = [];
	for (const document of pendingDocuments) {
		results.push(
			await syncFiscalDocument({
				organizationId,
				documentId: document.id,
				source: "CONSULTA_AUTOMATICA",
			}),
		);
	}
	return results;
}

/**
 * Pre-verificacao read-only de uma venda: roda as MESMAS portas da emissao (prontidao + motor
 * tributario) sem criar rascunho, sem reservar numeracao e sem chamar o provedor.
 *
 * Existe para responder "essa venda seria autorizada?" antes de gastar numeracao — emitir para
 * descobrir e caro: numero consumido, rejeicao registrada e, quando passa, uma nota real na SEFAZ.
 * Reaproveita `buildSaleFiscalContext` de proposito: uma copia das regras divergiria na primeira
 * mudanca e a verificacao passaria a mentir.
 *
 * O que ela NAO cobre: rejeicao da propria SEFAZ (cadastro do destinatario, ST, numeracao). Um
 * `pronto: true` significa "passou em tudo que conseguimos checar localmente".
 */
export async function checkSaleFiscalReadiness(input: TEmitirDocumentoInput): Promise<{
	pronto: boolean;
	problemas: TFiscalProblem[];
	contexto: { tipo: string; presencaConsumidor: string; serie: string; vNF: number | null } | null;
}> {
	try {
		const context = await buildSaleFiscalContext(input);
		assertFiscalReadiness(context);
		assertFiscalTaxationValid(context);
		return {
			pronto: true,
			problemas: [],
			contexto: {
				tipo: input.tipo,
				presencaConsumidor: context.operacao.presencaConsumidor,
				serie: context.serie.serie,
				vNF: computeSaleTaxation(context).totais.vNF,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { pronto: false, problemas: toFiscalProblemsFromError(error, message), contexto: null };
	}
}

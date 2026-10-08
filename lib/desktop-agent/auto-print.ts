import { getErrorMessage } from "@/lib/errors";
import { createSignedFiscalAssetUrl } from "@/lib/fiscal/storage";
import { OrganizationPrintPreferencesSchema, type TOrganizationAutoPrintRule } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import { organizations, sales, tabOrders, type TFiscalDocument, type TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { buildCupomVendaDados } from "./cupom-venda-data";
import { enqueuePrintJob, organizationHasActivePrinterForFinalidade } from "./print-jobs";
import { buildTicketPreparoDadosFromSale, buildTicketPreparoDadosFromTabOrder } from "./ticket-preparo-data";

// Orquestradores de impressão automática (docs/dev-planning/auto-print-wiring-plan.md).
// Mesma filosofia de processSaleAutomaticFiscalEmissionIfEligible: avaliam elegibilidade,
// rodam PÓS-COMMIT e NUNCA lançam — falha de impressão jamais quebra confirmação de venda,
// ingestão ou autorização fiscal. A chave de idempotência da fila permite ligar os hooks com
// folga: chamadas repetidas para a mesma venda/documento devolvem o job original.

// Chave de política derivada da venda: canal interno cru ("POS", "SHOP", "COMANDA") ou
// "INTEGRACAO-<canal>" para vendas externas ("INTEGRACAO-IFOOD"). `sales.canal` continua cru —
// o prefixo existe só na camada de política, e cada conector futuro ganha sua chave de graça.
export function resolvePrintPolicyChannel({
	canal,
	processamentoOrigem,
}: {
	canal: string | null;
	processamentoOrigem: string | null;
}): string | null {
	const normalizedChannel = canal?.trim().toUpperCase();
	if (!normalizedChannel) return null;
	return processamentoOrigem === "EXTERNO" ? `INTEGRACAO-${normalizedChannel}` : normalizedChannel;
}

// Leitura defensiva: `configuracao` não é re-parseada em cada leitura e linhas antigas não têm a
// chave `impressoes` até o próximo save de settings — o parse preenche os defaults (tudo off).
export function parsePrintPreferences(configuracao: TOrganizationEntity["configuracao"] | null | undefined) {
	return OrganizationPrintPreferencesSchema.parse(configuracao?.preferencias?.impressoes ?? undefined);
}

async function resolveConfiguracao({
	organizacaoId,
	configuracao,
}: {
	organizacaoId: string;
	configuracao?: TOrganizationEntity["configuracao"] | null;
}) {
	if (configuracao) return configuracao;
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
		columns: { configuracao: true },
	});
	return organization?.configuracao ?? null;
}

function isChannelAllowed({
	rule,
	canal,
	processamentoOrigem,
}: {
	rule: TOrganizationAutoPrintRule;
	canal: string | null;
	processamentoOrigem: string | null;
}) {
	const policyChannel = resolvePrintPolicyChannel({ canal, processamentoOrigem });
	return !!policyChannel && rule.canais.includes(policyChannel);
}

type TProcessSaleCupomAutoPrintParams = {
	organizacaoId: string;
	saleId: string;
	// Evita um fetch por venda quando o chamador já tem a config em mãos (hot paths de venda/sync).
	configuracao?: TOrganizationEntity["configuracao"] | null;
	solicitadoPorId?: string | null;
};
export async function processSaleCupomAutoPrintIfEligible({
	organizacaoId,
	saleId,
	configuracao,
	solicitadoPorId,
}: TProcessSaleCupomAutoPrintParams) {
	try {
		const resolvedConfiguracao = await resolveConfiguracao({ organizacaoId, configuracao });
		const rule = parsePrintPreferences(resolvedConfiguracao).automatica.CUPOM_VENDA;
		if (!rule.habilitada) return { status: "NAO_SOLICITADO" as const, reason: "IMPRESSAO_AUTOMATICA_DESATIVADA" as const };

		const sale = await db.query.sales.findFirst({
			where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizacaoId)),
			columns: { id: true, canal: true, processamentoOrigem: true, statusVenda: true },
		});
		if (!sale) return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_ENCONTRADA" as const };
		if (sale.statusVenda === "CANCELADA") return { status: "NAO_SOLICITADO" as const, reason: "VENDA_CANCELADA" as const };
		if (!isChannelAllowed({ rule, canal: sale.canal, processamentoOrigem: sale.processamentoOrigem })) {
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_NAO_HABILITADO" as const };
		}

		if (!(await organizationHasActivePrinterForFinalidade({ organizacaoId, finalidade: "CUPOM_VENDA" }))) {
			return { status: "NAO_SOLICITADO" as const, reason: "SEM_IMPRESSORA" as const };
		}

		const dados = await buildCupomVendaDados({ organizacaoId, vendaId: saleId });
		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade: "CUPOM_VENDA",
			dados: dados as unknown as Record<string, unknown>,
			origemTipo: "VENDA",
			origemId: saleId,
			copias: rule.copias,
			chaveIdempotencia: `CUPOM_VENDA:${saleId}`,
			solicitadoPorId: solicitadoPorId ?? null,
		});
		return { status: "SOLICITADO" as const, jobId: result.job.id, created: result.created };
	} catch (error) {
		console.error(`[AUTO_PRINT] [ORG: ${organizacaoId}] Falha no auto-print de cupom da venda ${saleId}.`, error);
		return { status: "ERRO" as const, error: getErrorMessage(error) };
	}
}
export type TProcessSaleCupomAutoPrintOutput = Awaited<ReturnType<typeof processSaleCupomAutoPrintIfEligible>>;

// Ticket de preparo por VENDA: o gatilho é a venda ENTRAR em EM_PREPARO, não o canal nem a
// modalidade. O orquestrador checa o estado ele mesmo — os chamadores (confirmação, transição
// manual, sync de integração) só o invocam pós-commit após qualquer escrita de status e não
// precisam saber se a venda "merece" ticket. EM_PREPARO nunca é reentrado (PRONTO não regride),
// então a chave por venda é exata. A venda rascunho de conta nunca passa por aqui: fecha nascendo
// ENTREGUE, e as rodadas imprimem por pedido (processTabOrderPreparationTicketAutoPrintIfEligible).
type TProcessSalePreparationTicketAutoPrintParams = {
	organizacaoId: string;
	saleId: string;
	configuracao?: TOrganizationEntity["configuracao"] | null;
	solicitadoPorId?: string | null;
};
export async function processSalePreparationTicketAutoPrintIfEligible({
	organizacaoId,
	saleId,
	configuracao,
	solicitadoPorId,
}: TProcessSalePreparationTicketAutoPrintParams) {
	try {
		const resolvedConfiguracao = await resolveConfiguracao({ organizacaoId, configuracao });
		const rule = parsePrintPreferences(resolvedConfiguracao).automatica.TICKET_PREPARO;
		if (!rule.habilitada) return { status: "NAO_SOLICITADO" as const, reason: "IMPRESSAO_AUTOMATICA_DESATIVADA" as const };

		const sale = await db.query.sales.findFirst({
			where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizacaoId)),
			columns: { id: true, canal: true, processamentoOrigem: true, statusVenda: true, statusAtendimento: true },
		});
		if (!sale) return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_ENCONTRADA" as const };
		if (sale.statusVenda !== "CONFIRMADA") return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_CONFIRMADA" as const };
		if (sale.statusAtendimento !== "EM_PREPARO") return { status: "NAO_SOLICITADO" as const, reason: "FORA_DO_PREPARO" as const };
		if (!isChannelAllowed({ rule, canal: sale.canal, processamentoOrigem: sale.processamentoOrigem })) {
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_NAO_HABILITADO" as const };
		}

		if (!(await organizationHasActivePrinterForFinalidade({ organizacaoId, finalidade: "TICKET_PREPARO" }))) {
			return { status: "NAO_SOLICITADO" as const, reason: "SEM_IMPRESSORA" as const };
		}

		const dados = await buildTicketPreparoDadosFromSale({ organizacaoId, vendaId: saleId });
		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade: "TICKET_PREPARO",
			dados: dados as unknown as Record<string, unknown>,
			origemTipo: "VENDA",
			origemId: saleId,
			copias: rule.copias,
			chaveIdempotencia: `TICKET_PREPARO:VENDA:${saleId}`,
			solicitadoPorId: solicitadoPorId ?? null,
		});
		return { status: "SOLICITADO" as const, jobId: result.job.id, created: result.created };
	} catch (error) {
		console.error(`[AUTO_PRINT] [ORG: ${organizacaoId}] Falha no auto-print do ticket de preparo da venda ${saleId}.`, error);
		return { status: "ERRO" as const, error: getErrorMessage(error) };
	}
}
export type TProcessSalePreparationTicketAutoPrintOutput = Awaited<ReturnType<typeof processSalePreparationTicketAutoPrintIfEligible>>;

// Ticket de preparo por PEDIDO DE CONTA (rodada). Chamado pós-commit do lançamento, venha ele do
// composer do operador ou da aprovação (manual ou automática) de uma solicitação pelo QR. O pedido
// nasce EM_PREPARO; a chave por pedido absorve o retry de lançamento (mesmo tabOrderId).
type TProcessTabOrderPreparationTicketAutoPrintParams = {
	organizacaoId: string;
	tabOrderId: string;
	configuracao?: TOrganizationEntity["configuracao"] | null;
	solicitadoPorId?: string | null;
};
export async function processTabOrderPreparationTicketAutoPrintIfEligible({
	organizacaoId,
	tabOrderId,
	configuracao,
	solicitadoPorId,
}: TProcessTabOrderPreparationTicketAutoPrintParams) {
	try {
		const resolvedConfiguracao = await resolveConfiguracao({ organizacaoId, configuracao });
		const rule = parsePrintPreferences(resolvedConfiguracao).automatica.TICKET_PREPARO;
		if (!rule.habilitada) return { status: "NAO_SOLICITADO" as const, reason: "IMPRESSAO_AUTOMATICA_DESATIVADA" as const };

		const order = await db.query.tabOrders.findFirst({
			where: and(eq(tabOrders.id, tabOrderId), eq(tabOrders.organizacaoId, organizacaoId)),
			columns: { id: true, status: true },
		});
		if (!order) return { status: "NAO_SOLICITADO" as const, reason: "PEDIDO_NAO_ENCONTRADO" as const };
		if (order.status !== "EM_PREPARO") return { status: "NAO_SOLICITADO" as const, reason: "FORA_DO_PREPARO" as const };
		// Rodada de conta é sempre canal interno COMANDA — a allowlist decide se a org imprime comandas.
		if (!isChannelAllowed({ rule, canal: "COMANDA", processamentoOrigem: "INTERNO" })) {
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_NAO_HABILITADO" as const };
		}

		if (!(await organizationHasActivePrinterForFinalidade({ organizacaoId, finalidade: "TICKET_PREPARO" }))) {
			return { status: "NAO_SOLICITADO" as const, reason: "SEM_IMPRESSORA" as const };
		}

		const dados = await buildTicketPreparoDadosFromTabOrder({ organizacaoId, tabOrderId });
		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade: "TICKET_PREPARO",
			dados: dados as unknown as Record<string, unknown>,
			origemTipo: "PEDIDO_CONTA",
			origemId: tabOrderId,
			copias: rule.copias,
			chaveIdempotencia: `TICKET_PREPARO:PEDIDO_CONTA:${tabOrderId}`,
			solicitadoPorId: solicitadoPorId ?? null,
		});
		return { status: "SOLICITADO" as const, jobId: result.job.id, created: result.created };
	} catch (error) {
		console.error(`[AUTO_PRINT] [ORG: ${organizacaoId}] Falha no auto-print do ticket de preparo do pedido ${tabOrderId}.`, error);
		return { status: "ERRO" as const, error: getErrorMessage(error) };
	}
}
export type TProcessTabOrderPreparationTicketAutoPrintOutput = Awaited<ReturnType<typeof processTabOrderPreparationTicketAutoPrintIfEligible>>;

// Validade da URL assinada do PDF: TTL do job de DANFE é 24h — assinar por 48h dá margem para
// leases/reimpressões tardias sem deixar o link vivo indefinidamente.
const DANFE_SIGNED_URL_EXPIRES_SECONDS = 48 * 60 * 60;

// Chamado após persistAuthorizedAssets gravar o pdfStoragePath (cobre emissão e sync). Vale para
// emissão automática E manual: a política é sobre a impressão, não sobre quem emitiu.
export async function processFiscalDocumentDanfeAutoPrintIfEligible({ documento }: { documento: TFiscalDocument }) {
	const organizacaoId = documento.organizacaoId;
	try {
		const finalidade = documento.tipo === "NFCE" ? ("DANFE_NFCE" as const) : documento.tipo === "NFE" ? ("DANFE_NFE" as const) : null;
		if (!finalidade) return { status: "NAO_SOLICITADO" as const, reason: "TIPO_SEM_DANFE" as const };
		if (!documento.vendaId) return { status: "NAO_SOLICITADO" as const, reason: "DOCUMENTO_SEM_VENDA" as const };
		if (!documento.pdfStoragePath) return { status: "NAO_SOLICITADO" as const, reason: "PDF_INDISPONIVEL" as const };

		const configuracao = await resolveConfiguracao({ organizacaoId });
		const rule = parsePrintPreferences(configuracao).automatica[finalidade];
		if (!rule.habilitada) return { status: "NAO_SOLICITADO" as const, reason: "IMPRESSAO_AUTOMATICA_DESATIVADA" as const };

		const sale = await db.query.sales.findFirst({
			where: and(eq(sales.id, documento.vendaId), eq(sales.organizacaoId, organizacaoId)),
			columns: { id: true, canal: true, processamentoOrigem: true },
		});
		if (!sale) return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_ENCONTRADA" as const };
		if (!isChannelAllowed({ rule, canal: sale.canal, processamentoOrigem: sale.processamentoOrigem })) {
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_NAO_HABILITADO" as const };
		}

		if (!(await organizationHasActivePrinterForFinalidade({ organizacaoId, finalidade }))) {
			return { status: "NAO_SOLICITADO" as const, reason: "SEM_IMPRESSORA" as const };
		}

		const pdfUrl = await createSignedFiscalAssetUrl({ storagePath: documento.pdfStoragePath, expiresInSeconds: DANFE_SIGNED_URL_EXPIRES_SECONDS });
		const result = await enqueuePrintJob({
			organizacaoId,
			finalidade,
			dados: { pdfUrl },
			origemTipo: "NOTA_FISCAL",
			origemId: documento.id,
			copias: rule.copias,
			chaveIdempotencia: `DANFE:${documento.id}`,
		});
		return { status: "SOLICITADO" as const, jobId: result.job.id, created: result.created };
	} catch (error) {
		console.error(`[AUTO_PRINT] [ORG: ${organizacaoId}] Falha no auto-print de DANFE do documento ${documento.id}.`, error);
		return { status: "ERRO" as const, error: getErrorMessage(error) };
	}
}
export type TProcessFiscalDocumentDanfeAutoPrintOutput = Awaited<ReturnType<typeof processFiscalDocumentDanfeAutoPrintIfEligible>>;

import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import type { TSaleErpFiscalDocument } from "@/lib/sales/erp-data";
import type { TSalePaymentGroup } from "@/lib/sales/utils";
import type { TFiscalDocumentLifecycleStatusEnum, TFiscalDocumentTypeEnum, TPaymentMethodEnum } from "@/schemas/enums";

/**
 * Textos-resumo da exportação de vendas: uma célula de planilha por venda para a composição, os
 * pagamentos e os documentos fiscais. Puros (sem banco) de propósito — a rota de exportação só
 * carrega os dados e delega a leitura para cá, e os testes fixam o formato de cada célula.
 */

/** Limite de caracteres de uma célula-resumo. Bem abaixo dos 32.767 do Excel, e ainda legível. */
const MAX_SUMMARY_LENGTH = 1500;
const SUMMARY_SEPARATOR = "; ";

export type TSaleExportItem = {
	quantidade: number;
	valorVendaTotalLiquido: number;
	produto: { nome: string } | null;
	produtoVariante?: { nome: string } | null;
};

function formatQuantity(quantidade: number) {
	return Number.isInteger(quantidade) ? String(quantidade) : quantidade.toLocaleString("pt-br", { maximumFractionDigits: 3 });
}

/**
 * Junta as partes até o limite. Uma venda de atacado com centenas de itens não pode estourar a
 * célula; a partir do corte, a célula termina dizendo quantos itens ficaram de fora.
 */
function joinWithinLimit(parts: string[], maxLength: number, unit: { singular: string; plural: string }) {
	let summary = "";
	for (let index = 0; index < parts.length; index++) {
		const candidate = summary ? `${summary}${SUMMARY_SEPARATOR}${parts[index]}` : parts[index];
		if (candidate.length > maxLength) {
			const remaining = parts.length - index;
			const suffix = ` (+${remaining} ${remaining === 1 ? unit.singular : unit.plural})`;
			// Nem a primeira parte coube: corta a própria parte em vez de devolver só o sufixo.
			const kept = summary || parts[index].slice(0, Math.max(0, maxLength - suffix.length));
			return `${kept}${suffix}`;
		}
		summary = candidate;
	}
	return summary;
}

/** "2x Camiseta (P) - R$ 59,80; 1x Boné - R$ 35,00" */
export function buildSaleCompositionSummary(itens: TSaleExportItem[], maxLength = MAX_SUMMARY_LENGTH): string {
	const parts = itens.map((item) => {
		const name = item.produto?.nome ?? "Produto removido";
		const variant = item.produtoVariante?.nome ? ` (${item.produtoVariante.nome})` : "";
		return `${formatQuantity(item.quantidade)}x ${name}${variant} - ${formatToMoney(item.valorVendaTotalLiquido)}`;
	});
	return joinWithinLimit(parts, maxLength, { singular: "item", plural: "itens" });
}

function describePaymentState(group: TSalePaymentGroup) {
	if (group.cancelado) return "cancelado";
	if (group.parcelasTotal > 1) {
		const base = `${group.parcelasRecebidas}/${group.parcelasTotal} recebidas`;
		return group.emAtraso ? `${base}, em atraso` : base;
	}
	if (group.parcelasRecebidas >= 1) return "recebido";
	if (group.emAtraso) return "em atraso";
	const dueDate = group.proximoVencimento ? formatDateAsLocale(group.proximoVencimento) : null;
	return dueDate ? `pendente, vence em ${dueDate}` : "pendente";
}

/** Troco devolvido, por método de devolução. Sai de `groupSaleChangeByMethod`. */
export type TSaleChangeByMethod = { metodo: TPaymentMethodEnum; valor: number };

/**
 * "Cartão de crédito 3x R$ 300,00 (2/3 recebidas); Pix R$ 50,00 (recebido)"
 *
 * Os grupos são só as ENTRADAs — o que o cliente entregou. O troco entra como parcela negativa no
 * fim da célula porque sem ele uma venda de R$ 78 paga com R$ 100 em Pix lê "Pix R$ 100,00
 * (recebido)" e nada explica os R$ 22 que voltaram. Fica fora do corte por tamanho: numa venda com
 * muitos pagamentos, a linha que desaparece não pode ser justamente a que concilia a diferença.
 */
export function buildSalePaymentsSummary(grupos: TSalePaymentGroup[], trocos: TSaleChangeByMethod[] = [], maxLength = MAX_SUMMARY_LENGTH): string {
	const parts = grupos.map((group) => {
		const label = PAYMENT_METHOD_LABELS[group.metodo] ?? group.metodo;
		const installments = group.parcelasTotal > 1 ? ` ${group.parcelasTotal}x` : "";
		return `${label}${installments} ${formatToMoney(group.valor)} (${describePaymentState(group)})`;
	});
	const changeParts = trocos
		.filter((troco) => troco.valor > 0)
		.map((troco) => `Troco em ${(PAYMENT_METHOD_LABELS[troco.metodo] ?? troco.metodo).toLowerCase()} −${formatToMoney(troco.valor)}`);
	const changeSuffix = changeParts.length > 0 ? `${SUMMARY_SEPARATOR}${changeParts.join(SUMMARY_SEPARATOR)}` : "";
	const summary = joinWithinLimit(parts, Math.max(0, maxLength - changeSuffix.length), { singular: "pagamento", plural: "pagamentos" });
	if (!summary) return changeParts.join(SUMMARY_SEPARATOR);
	return `${summary}${changeSuffix}`;
}

export const FISCAL_DOCUMENT_TYPE_LABELS: Record<TFiscalDocumentTypeEnum, string> = {
	NFCE: "NFC-e",
	NFE: "NF-e",
	NFSE: "NFS-e",
};

const FISCAL_LIFECYCLE_STATUS_LABELS: Record<TFiscalDocumentLifecycleStatusEnum, string> = {
	RASCUNHO: "rascunho",
	PRONTO_PARA_ENVIO: "pronta para envio",
	EM_PROCESSAMENTO: "em processamento",
	AUTORIZADO: "autorizada",
	REJEITADO: "rejeitada",
	CANCELAMENTO_PENDENTE: "cancelamento pendente",
	CANCELADO: "cancelada",
	INUTILIZADO: "inutilizada",
	ERRO: "erro na emissão",
};

type FiscalSummaryDocument = Pick<
	TSaleErpFiscalDocument,
	"tipo" | "statusInterno" | "numero" | "serie" | "dataAutorizacao" | "dataCancelamento" | "dataInsercao"
>;

/**
 * "NFC-e Nº 1234 série 1, autorizada em 12/09/2026; NFC-e Nº 1234 série 1, cancelada em 13/09/2026"
 * Em ordem cronológica: a sequência conta a história da nota na direção em que ela aconteceu.
 */
export function buildSaleFiscalSummary(documentos: FiscalSummaryDocument[], maxLength = MAX_SUMMARY_LENGTH): string {
	const sorted = [...documentos].sort((a, b) => a.dataInsercao.getTime() - b.dataInsercao.getTime());
	const parts = sorted.map((documento) => {
		const type = FISCAL_DOCUMENT_TYPE_LABELS[documento.tipo] ?? documento.tipo;
		const number = documento.numero ? ` Nº ${documento.numero}` : "";
		const series = documento.serie ? ` série ${documento.serie}` : "";
		const status = FISCAL_LIFECYCLE_STATUS_LABELS[documento.statusInterno] ?? documento.statusInterno;
		const date =
			documento.statusInterno === "CANCELADO" ? documento.dataCancelamento : documento.statusInterno === "AUTORIZADO" ? documento.dataAutorizacao : null;
		const when = date ? ` em ${formatDateAsLocale(date)}` : "";
		return `${type}${number}${series}, ${status}${when}`;
	});
	return joinWithinLimit(parts, maxLength, { singular: "documento", plural: "documentos" });
}

/**
 * Documento "principal" de uma venda: o autorizado mais recente; sem autorizado, o mais recente.
 * É o que o chip do histórico mostra e o que a exportação usa para número e chave de acesso.
 * Espera a lista em ordem cronológica de inserção (a ordem em que `loadSalesErpData` devolve).
 */
export function resolvePrimarySaleFiscalDocument<T extends Pick<TSaleErpFiscalDocument, "statusInterno">>(documentos: T[]): T | null {
	return [...documentos].reverse().find((documento) => documento.statusInterno === "AUTORIZADO") ?? documentos[documentos.length - 1] ?? null;
}

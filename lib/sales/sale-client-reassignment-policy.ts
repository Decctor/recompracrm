import { saleFiscalDocumentsAllowCancellation } from "@/lib/sales/sale-editability";

/**
 * Política de reatribuição de cliente de uma venda CONFIRMADA (definir, trocar ou desvincular),
 * derivada do estado da venda e nunca persistida. Client-safe: a rota usa para a prévia e o
 * processador re-executa sob lock com a mesma função.
 *
 * Plano: docs/dev-planning/sale-client-reassignment-plan.md.
 */

// Estados em que o documento carrega (ou está prestes a carregar) um destinatário real na SEFAZ.
// Rascunho, pronto para envio, rejeitado e erro nunca foram autorizados: o próximo envio
// reconstrói o payload a partir da venda e sai em nome do novo cliente — não há o que corrigir.
const FISCAL_STATUSES_WITH_DESTINATARIO = new Set(["AUTORIZADO", "CANCELAMENTO_PENDENTE", "EM_PROCESSAMENTO"]);

export type TSaleClientReassignmentDocument = {
	id: string;
	tipo: string;
	numero?: string | null;
	statusInterno: string | null;
	documentoOrigemId?: string | null;
	// CPF/CNPJ gravado no snapshot do destinatário na criação do documento (null = nota sem
	// identificação do consumidor).
	destinatarioCpfCnpj?: string | null;
};

export type TSaleClientReassignmentRow = {
	statusVenda: string | null;
	processamentoOrigem: string | null;
	tabId?: string | null;
	clienteId: string | null;
	documentosFiscais: TSaleClientReassignmentDocument[];
	// Transações de cashback da venda: qualquer RESGATE vivo (desconto ou recompensa) bloqueia.
	transacoesCashback: { tipo: string; status: string }[];
	// Resgates de cupom da venda com status UTILIZADO.
	cuponsResgatados: { status: string }[];
};

// Viaja como dado para a UI (campos em português).
export type TSaleClientReassignmentPolicy = {
	elegivel: boolean;
	motivos: string[];
	// NFC-e viva com CPF do cliente atual: permitido, mas exige consentimento explícito do operador.
	confirmacaoFiscalExigida: boolean;
	documentoFiscal: { id: string; tipo: string; numero: string | null } | null;
};

function hasDigits(value: string | null | undefined) {
	return (value ?? "").replace(/\D/g, "").length > 0;
}

export function resolveSaleClientReassignmentPolicy(sale: TSaleClientReassignmentRow): TSaleClientReassignmentPolicy {
	const motivos: string[] = [];

	if (sale.processamentoOrigem !== "INTERNO") motivos.push("Vendas de canais externos não são editáveis.");
	if (sale.statusVenda === "ORCAMENTO") motivos.push("Rascunhos definem o cliente pelo checkout.");
	else if (sale.statusVenda !== "CONFIRMADA") motivos.push("Somente vendas confirmadas podem ter o cliente alterado.");
	if (sale.tabId) motivos.push("Venda de conta de atendimento: o cliente é definido pela conta.");

	const hasLiveRedemption = sale.transacoesCashback.some((transaction) => transaction.tipo === "RESGATE" && transaction.status === "ATIVO");
	if (hasLiveRedemption) motivos.push("Esta venda usou saldo de cashback do cliente atual. Cancele a venda e refaça com o cliente correto.");

	const hasCouponRedemption = sale.cuponsResgatados.some((redemption) => redemption.status === "UTILIZADO");
	if (hasCouponRedemption) motivos.push("Esta venda usou um cupom do cliente atual. Cancele a venda e refaça com o cliente correto.");

	const liveDocuments = sale.documentosFiscais.filter((document) => FISCAL_STATUSES_WITH_DESTINATARIO.has(document.statusInterno ?? ""));
	// NF-e (e qualquer modelo que não seja NFC-e): o destinatário é parte do documento e não há
	// evento de correção para ele. Uma devolução autorizada encerra a original, como no cancelamento.
	const blockingDocuments = liveDocuments.filter((document) => document.tipo !== "NFCE");
	const returnedOriginIds = new Set(
		blockingDocuments
			.filter((document) => document.statusInterno === "AUTORIZADO" && document.documentoOrigemId)
			.map((document) => document.documentoOrigemId),
	);
	const blockingDocument = saleFiscalDocumentsAllowCancellation(blockingDocuments)
		? null
		: (blockingDocuments.find((document) => !document.documentoOrigemId && !returnedOriginIds.has(document.id)) ?? blockingDocuments[0] ?? null);
	if (blockingDocument) {
		const label = `${blockingDocument.tipo === "NFE" ? "NF-e" : blockingDocument.tipo}${blockingDocument.numero ? ` nº ${blockingDocument.numero}` : ""}`;
		motivos.push(
			blockingDocument.statusInterno === "EM_PROCESSAMENTO"
				? `A ${label} está em processamento na SEFAZ em nome do cliente atual. Aguarde o desfecho antes de trocar o cliente.`
				: `A ${label} foi emitida em nome do cliente atual. Cancele ou gere a devolução da nota antes de trocar o cliente.`,
		);
	}

	const identifiedNfce = liveDocuments.find((document) => document.tipo === "NFCE" && hasDigits(document.destinatarioCpfCnpj)) ?? null;
	const documentoFiscal = blockingDocument ?? identifiedNfce;

	return {
		elegivel: motivos.length === 0,
		motivos,
		confirmacaoFiscalExigida: motivos.length === 0 && identifiedNfce !== null,
		documentoFiscal: documentoFiscal ? { id: documentoFiscal.id, tipo: documentoFiscal.tipo, numero: documentoFiscal.numero ?? null } : null,
	};
}

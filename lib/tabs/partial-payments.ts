// ============================================================================
// Saldo de uma conta com recebimentos parciais. Modulo client-safe (sem banco):
// o ClosePane e o servidor (closeTab, receiveTabPayment) aplicam as mesmas regras.
//
// consumo (liquido dos itens) - desconto + acrescimo = valorTotal
// valorTotal - jaPago = restante
//
// O teto do parcial e o consumo atual (sem desconto/acrescimo do fechamento): o
// fechamento ainda nao aconteceu, entao o que existe para abater e o que foi
// consumido. Se o total final ficar abaixo do ja pago, o fechamento bloqueia e
// pede estorno — nunca "devolve" silenciosamente.
// ============================================================================

export const TAB_PAYMENT_TOLERANCE = 0.01;

/** Origem carimbada em `financialTransactions.modificadoresMetadata` do recebimento parcial. */
export const TAB_PARTIAL_PAYMENT_TRANSACTION_ORIGIN = "PAGAMENTO_PARCIAL_CONTA";
/** Origem da SAIDA de dinheiro do estorno de um parcial (nunca TROCO: o detPag desconta troco). */
export const TAB_PARTIAL_PAYMENT_REFUND_TRANSACTION_ORIGIN = "ESTORNO_PAGAMENTO_PARCIAL";

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type TTabPaymentLike = { valor: number; status: string };

export type TTabDraftItemLike = { valorVendaTotalLiquido: number; quantidade: number; quantidadeCancelada: number };

/**
 * Consumo da conta = liquido dos itens ativos da venda rascunho. E o mesmo numero que o
 * fechamento recalcula sob o lock (recomputeTabDraftSaleTotals): a tela parte daqui, e nao de
 * `sales.valorTotal`, para nao divergir do servidor se o total gravado ficar desatualizado.
 */
export function sumTabDraftConsumption(items: TTabDraftItemLike[]) {
	// v1 cancela itens inteiros (quantidadeCancelada === quantidade); itens cancelados saem do consumo.
	return roundCents(items.filter((item) => item.quantidadeCancelada < item.quantidade).reduce((sum, item) => sum + item.valorVendaTotalLiquido, 0));
}

/** Soma dos parciais ativos (estornados ficam de fora). */
export function sumActiveTabPayments(payments: TTabPaymentLike[]) {
	return roundCents(payments.filter((payment) => payment.status === "ATIVO").reduce((sum, payment) => sum + payment.valor, 0));
}

export type TTabBalance = {
	consumo: number;
	descontoGeral: number;
	acrescimoGeral: number;
	valorTotal: number;
	jaPago: number;
	restante: number;
	/** Total final abaixo do ja recebido: fechamento bloqueado ate estornar um parcial. */
	bloqueio: string | null;
};

export function resolveTabBalance({
	consumo,
	descontoGeral = 0,
	acrescimoGeral = 0,
	jaPago,
}: {
	consumo: number;
	descontoGeral?: number | null;
	acrescimoGeral?: number | null;
	jaPago: number;
}): TTabBalance {
	const desconto = Math.max(0, descontoGeral ?? 0);
	const acrescimo = Math.max(0, acrescimoGeral ?? 0);
	const valorTotal = roundCents(Math.max(0, consumo - desconto) + acrescimo);
	const pago = roundCents(Math.max(0, jaPago));
	const restante = roundCents(Math.max(0, valorTotal - pago));
	const bloqueio =
		pago > valorTotal + TAB_PAYMENT_TOLERANCE ? "Os pagamentos parciais superam o total da conta. Estorne um recebimento antes de fechar." : null;
	return { consumo, descontoGeral: desconto, acrescimoGeral: acrescimo, valorTotal, jaPago: pago, restante, bloqueio };
}

/** Quanto ainda cabe num novo parcial: consumo atual menos o que ja foi recebido. */
export function resolveTabPartialPaymentCap({ consumo, jaPago }: { consumo: number; jaPago: number }) {
	return roundCents(Math.max(0, consumo - jaPago));
}

/** Motivo para recusar um parcial de `valor`, ou null quando cabe. */
export function getTabPartialPaymentBlockReason({ consumo, jaPago, valor }: { consumo: number; jaPago: number; valor: number }) {
	if (!Number.isFinite(valor) || valor <= 0) return "Informe um valor maior que zero.";
	const cap = resolveTabPartialPaymentCap({ consumo, jaPago });
	if (valor > cap + TAB_PAYMENT_TOLERANCE) return `O valor supera o saldo da conta: ${formatCapForMessage(cap)}.`;
	return null;
}

function formatCapForMessage(value: number) {
	return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/** O restante a receber no fechamento coincide com a soma informada (tolerancia de centavo)? */
export function tabPaymentsMatchRemaining({ paymentsTotal, restante }: { paymentsTotal: number; restante: number }) {
	return Math.abs(roundCents(paymentsTotal) - roundCents(restante)) <= TAB_PAYMENT_TOLERANCE;
}

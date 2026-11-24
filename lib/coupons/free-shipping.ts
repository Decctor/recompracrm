import type { TCouponEvaluationResult } from "./engine";

/**
 * Cupom de frete grátis nos totais de uma venda.
 *
 * O cupom não é um desconto: a venda nasce SEM a taxa de entrega (como no "grátis acima de" da
 * loja), então fiscal, impressão e contabilidade enxergam uma venda sem frete, que já sabem tratar.
 * O que o cupom custou fica em dois lugares, e só neles:
 * - no cupom aplicado (`cupomResgate.taxaEntregaIsenta`, com `valorDesconto` 0), enquanto a venda é
 *   carrinho ou rascunho;
 * - no resgate (`coupon_redemptions.valorDesconto`, com `beneficioSnapshot.beneficioTipo` =
 *   FRETE_GRATIS), depois da confirmação.
 *
 * Por isso `sales.descontosTotal` nunca inclui a taxa isenta, e quem deriva "desconto do cupom
 * sobre os itens" a partir do resgate precisa passar por `readCouponRedemptionItemDiscount`.
 */

type TAppliedCouponValues = { valorDesconto: number; taxaEntregaIsenta?: number | null };

/** Taxa de entrega que o cupom aplicado isenta (0 quando o cupom não é de frete grátis). */
export function readAppliedCouponWaivedDeliveryFee(coupon: TAppliedCouponValues | null | undefined): number {
	const waived = coupon?.taxaEntregaIsenta;
	return typeof waived === "number" && Number.isFinite(waived) && waived > 0 ? waived : 0;
}

/** Avaliação do motor → valores do cupom aplicado: o que abate dos itens e o que isenta da entrega. */
export function resolveAppliedCouponValues(evaluation: Extract<TCouponEvaluationResult, { elegivel: true }>): {
	valorDesconto: number;
	taxaEntregaIsenta: number | null;
} {
	if (evaluation.aplicacao === "ENTREGA") return { valorDesconto: 0, taxaEntregaIsenta: evaluation.valorDesconto };
	return { valorDesconto: evaluation.valorDesconto, taxaEntregaIsenta: null };
}

/**
 * O cupom aplicado diverge dos valores resolvidos pelo motor? É a mesma régua no pedido da loja
 * (que recusa o envio) e no checkout (que ressincroniza o cupom): comparar só `valorDesconto` com a
 * avaliação crua confunde a taxa isenta do frete grátis com desconto nos itens.
 */
export function hasAppliedCouponValuesDrifted(
	applied: TAppliedCouponValues,
	resolved: ReturnType<typeof resolveAppliedCouponValues>,
	itemDiscountTolerance = 0.01,
): boolean {
	return (
		Math.abs(resolved.valorDesconto - applied.valorDesconto) > itemDiscountTolerance ||
		Math.abs((resolved.taxaEntregaIsenta ?? 0) - readAppliedCouponWaivedDeliveryFee(applied)) > 0.01
	);
}

/**
 * Ressincronização do cupom aplicado no checkout da loja com uma avaliação nova do motor. Devolve o
 * próprio `applied` quando nada mudou, para o chamador não disparar um update à toa.
 */
export function reconcileAppliedCouponValues<T extends TAppliedCouponValues & { brinde?: unknown }>(
	applied: T,
	evaluation: Extract<TCouponEvaluationResult, { elegivel: true }>,
): T {
	const resolved = resolveAppliedCouponValues(evaluation);
	return hasAppliedCouponValuesDrifted(applied, resolved, applied.brinde ? 0.000001 : 0.01) ? { ...applied, ...resolved } : applied;
}

/**
 * Derivação do carrinho do PDV: com um cupom de frete grátis aplicado, a taxa cobrada é zero e o
 * cupom carrega a taxa que a venda teria. Derivar (em vez de zerar a taxa no estado) mantém a taxa
 * do operador guardada: tirar o cupom devolve a cobrança, e mudar a taxa atualiza o valor isentado.
 */
export function applyFreeShippingCoupon<T extends { taxaEntrega: number; cupomResgate?: TAppliedCouponValues | null }>(state: T): T {
	const coupon = state.cupomResgate;
	if (!coupon || coupon.taxaEntregaIsenta === null || coupon.taxaEntregaIsenta === undefined) return state;
	return { ...state, taxaEntrega: 0, cupomResgate: { ...coupon, valorDesconto: 0, taxaEntregaIsenta: state.taxaEntrega } };
}

type TCouponRedemptionValues = { valorDesconto: number; beneficioSnapshot?: unknown };

export function isFreeShippingRedemption(redemption: Pick<TCouponRedemptionValues, "beneficioSnapshot"> | null | undefined): boolean {
	const snapshot = redemption?.beneficioSnapshot;
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
	return (snapshot as { beneficioTipo?: unknown }).beneficioTipo === "FRETE_GRATIS";
}

/** Quanto o resgate abateu dos ITENS da venda: zero no frete grátis, cujo valor é a taxa isenta. */
export function readCouponRedemptionItemDiscount(redemption: TCouponRedemptionValues | null | undefined): number {
	if (!redemption || isFreeShippingRedemption(redemption)) return 0;
	return redemption.valorDesconto;
}

/** Taxa de entrega que o resgate isentou (0 quando o resgate não é de frete grátis). */
export function readCouponRedemptionWaivedDeliveryFee(redemption: TCouponRedemptionValues | null | undefined): number {
	if (!redemption || !isFreeShippingRedemption(redemption)) return 0;
	return redemption.valorDesconto;
}

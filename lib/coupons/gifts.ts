import { evaluateCouponAgainstCart, itemMatchesTarget } from "./engine";
import type { TCouponGiftSelection } from "@/schemas/coupons";

type TEvaluationInput = Parameters<typeof evaluateCouponAgainstCart>[0];

/** A identidade do carrinho sobrevive à persistência sem depender da posição da linha. */
export function readCouponItemIdentity(item: { id: string; metadados?: unknown }) {
	const metadata = item.metadados as { itemChave?: unknown } | null;
	return typeof metadata?.itemChave === "string" && metadata.itemChave ? metadata.itemChave : item.id;
}

export function readCouponItemBasePrice(item: { valorVendaUnitario: number; metadados?: unknown; adicionais?: Array<{ valorTotal: number }> }) {
	const metadata = item.metadados as { valorUnitarioBase?: unknown } | null;
	return typeof metadata?.valorUnitarioBase === "number"
		? metadata.valorUnitarioBase
		: Math.max(0, item.valorVendaUnitario - (item.adicionais ?? []).reduce((sum, modifier) => sum + modifier.valorTotal, 0));
}

/** Prévia por escolha: não aplica automaticamente o brinde mais barato ou o primeiro item. */
export function buildCouponGiftOptions(input: TEvaluationInput) {
	if (input.coupon.beneficioTipo !== "BRINDE") return [];
	return input.cartItems
		.filter((item) => input.targets.some((target) => target.papel === "BENEFICIADO" && itemMatchesTarget(item, target)))
		.map((item) => ({
			itemChave: item.chave,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId ?? null,
			avaliacao: evaluateCouponAgainstCart({ ...input, brinde: { itemChave: item.chave, quantidade: 1 } }),
		}));
}

export function filterCouponGiftProducts<T extends { id: string; grupo?: string | null; variantes: Array<{ id: string }> }>(
	products: T[],
	targets: TEvaluationInput["targets"],
) {
	const gifts = targets.filter((target) => target.papel === "BENEFICIADO");
	return products.flatMap((product) => {
		const wholeProduct = gifts.some((target) => itemMatchesTarget({ produtoId: product.id, grupo: product.grupo }, target));
		if (wholeProduct) return [product];
		const variantes = product.variantes.filter((variant) =>
			gifts.some((target) => itemMatchesTarget({ produtoId: product.id, produtoVarianteId: variant.id }, target)),
		);
		return variantes.length > 0 ? [{ ...product, variantes }] : [];
	});
}
export type TCouponGiftOption = ReturnType<typeof buildCouponGiftOptions>[number];

export function resolveAppliedCouponEvaluation<
	T extends { avaliacao: ReturnType<typeof evaluateCouponAgainstCart> | null; brindes?: TCouponGiftOption[] },
>(coupon: T | undefined, applied: { brinde?: TCouponGiftSelection | null }) {
	if (!applied.brinde) return coupon?.avaliacao;
	return coupon?.brindes?.find((option) => option.itemChave === applied.brinde?.itemChave)?.avaliacao ?? {
		elegivel: false as const,
		motivo: "O produto selecionado como brinde não está mais disponível neste carrinho. Escolha o brinde novamente.",
	};
}

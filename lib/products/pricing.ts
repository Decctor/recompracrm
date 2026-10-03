import { isSamePrice } from "./price-snapshot";

// Por quanto tempo uma redução de preço ainda conta como promoção ("De / Por"). Depois disso o preço
// anterior fica velho demais para ser anunciado como referência.
export const PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TPromotionResolution = {
	emPromocao: boolean;
	// Preço "De" a exibir; nulo fora de promoção.
	precoDe: number | null;
	// Desconto inteiro sobre o "De" (0–100); nulo fora de promoção.
	percentualDesconto: number | null;
};

const NO_PROMOTION: TPromotionResolution = { emPromocao: false, precoDe: null, percentualDesconto: null };

/**
 * Promoção inferida do snapshot: o preço anterior é maior que o atual e a mudança foi há no máximo
 * `PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS` dias.
 *
 * `precoAtual` é o preço efetivo de onde a peça é exibida — o do canal (`resolveChannelPrice`) quando
 * houver um, senão o preço base. O "De" é sempre o anterior do preço base: preços por canal não têm
 * snapshot.
 */
export function resolvePromotion({
	precoAtual,
	precoVendaAnterior,
	dataAlteracaoPrecoVenda,
	agora = new Date(),
}: {
	precoAtual: number | null;
	precoVendaAnterior: number | null;
	dataAlteracaoPrecoVenda: Date | string | null;
	agora?: Date;
}): TPromotionResolution {
	if (precoAtual == null || precoVendaAnterior == null || dataAlteracaoPrecoVenda == null) return NO_PROMOTION;
	if (precoVendaAnterior <= precoAtual || isSamePrice(precoVendaAnterior, precoAtual)) return NO_PROMOTION;

	const changedAt = new Date(dataAlteracaoPrecoVenda).getTime();
	if (Number.isNaN(changedAt)) return NO_PROMOTION;
	const elapsed = agora.getTime() - changedAt;
	if (elapsed > PROMOTION_PREVIOUS_PRICE_WINDOW_DAYS * DAY_MS) return NO_PROMOTION;

	return {
		emPromocao: true,
		precoDe: precoVendaAnterior,
		percentualDesconto: Math.round((1 - precoAtual / precoVendaAnterior) * 100),
	};
}

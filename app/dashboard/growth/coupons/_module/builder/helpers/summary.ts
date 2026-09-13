import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";

type TState = TUseInternalCouponState["state"];

/** Short, human label for the benefit itself (used in chips). */
export function buildBenefitLabel(coupon: TState["coupon"]): string {
	switch (coupon.beneficioTipo) {
		case "DESCONTO_PERCENTUAL": {
			const base = `${coupon.beneficioValor ?? 0}% de desconto`;
			return coupon.beneficioDescontoMaximo ? `${base} (até ${formatToMoney(coupon.beneficioDescontoMaximo)})` : base;
		}
		case "DESCONTO_FIXO":
			return `${formatToMoney(coupon.beneficioValor ?? 0)} de desconto`;
		case "PRECO_FIXO":
			return `preço fixo de ${formatToMoney(coupon.beneficioValor ?? 0)} por unidade`;
		case "COMPRE_X_LEVE_Y":
			return `leve ${coupon.beneficioLeveQuantidade ?? 0}, pague ${coupon.beneficioCompreQuantidade ?? 0}`;
		default:
			return "um brinde";
	}
}

/**
 * Plain-language description of the whole coupon for the live preview strip.
 * Reads like something the lojista would say out loud.
 */
export function buildCouponSummary(state: TState): string {
	const { coupon, couponTargets, couponAudiences } = state;
	const parts: string[] = [`Cliente ganha ${buildBenefitLabel(coupon)}`];

	if (coupon.beneficioAplicacao === "ITENS_ELEGIVEIS") parts.push("nos produtos selecionados");
	else parts.push("na compra");

	if (coupon.condicaoValorMinimoVenda) parts.push(`em compras a partir de ${formatToMoney(coupon.condicaoValorMinimoVenda)}`);
	if (coupon.condicaoQuantidadeMinimaItens) parts.push(`com pelo menos ${coupon.condicaoQuantidadeMinimaItens} itens`);
	if (coupon.condicaoPrimeiraCompra) parts.push("somente na primeira compra");
	if (coupon.condicaoModalidadesEntrega?.length) {
		const labels = { PRESENCIAL: "presencial", RETIRADA: "retirada", ENTREGA: "entrega", COMANDA: "comanda" } as const;
		parts.push(`nas modalidades ${coupon.condicaoModalidadesEntrega.map((mode) => labels[mode]).join(", ")}`);
	}

	if (coupon.escopo === "INDIVIDUAL") {
		parts.push("para clientes específicos");
	} else {
		const activeAudiences = couponAudiences.filter((audience) => !audience.deletar);
		if (activeAudiences.length > 0) {
			const names = activeAudiences.map((audience) => audience.clienteTagTitulo ?? audience.segmentacaoRFM ?? "segmento").join(", ");
			parts.push(`para clientes de ${names}`);
		} else {
			parts.push("para qualquer cliente");
		}
	}

	if (coupon.vigenciaFim) parts.push(`até ${formatDateAsLocale(coupon.vigenciaFim)}`);

	let sentence = `${parts.join(" ")}.`;
	if (coupon.validacaoModo === "MANUAL") sentence += " O operador confere as condições no balcão.";

	const activeTargets = couponTargets.filter((target) => !target.deletar);
	if (coupon.beneficioAplicacao === "ITENS_ELEGIVEIS" && activeTargets.length === 0 && coupon.validacaoModo === "AUTOMATICA") {
		sentence += " (Falta escolher os produtos alvo.)";
	}

	return sentence;
}

// Ajustes de cabeçalho da venda (desconto geral e acréscimo geral) e os helpers do checkout que os
// calculam: percentual sobre os itens, arredondamento do total e "fechar em" um total desejado.
//
// O percentual é a fonte da verdade quando está ativo: o valor em R$ é derivado da base a cada
// leitura (`applyPercentAdjustments`), nunca guardado e sincronizado. Assim, bipar mais um item
// depois do "Serviço 10%" recalcula os 10% sem efeito, sem render intermediário e sem depender de
// cada mutação dos itens lembrar de recalcular.

export type TSaleAdjustmentMode = "VALOR" | "PERCENTUAL";

/** Valor digitado no ajuste: R$ em `VALOR`, pontos percentuais em `PERCENTUAL`. */
export type TSaleAdjustmentInput = { mode: TSaleAdjustmentMode; amount: number };

export const EMPTY_SALE_ADJUSTMENT: TSaleAdjustmentInput = { mode: "VALOR", amount: 0 };

// Percentuais prontos da bandeja, os mesmos no checkout e no fechamento de conta. No acréscimo, 10%
// é a taxa de serviço padrão; 12% e 15% cobrem as casas que cobram serviço mais alto; 5% as taxas
// menores (repasse de cartão, entrega). Valores fixos (couvert, embalagem) dependem de cada casa e
// ficam para a configuração por organização.
export const DISCOUNT_PERCENT_PRESETS = [5, 10, 15];
export const SURCHARGE_PERCENT_PRESETS = [5, 10, 12, 15];

const roundCents = (value: number) => Math.round(value * 100) / 100;

export function clampAdjustmentPercent(percentual: number) {
	if (!Number.isFinite(percentual)) return 0;
	return roundCents(Math.min(100, Math.max(0, percentual)));
}

/** R$ de um percentual sobre a base (o subtotal dos itens). */
export function resolvePercentAdjustment({ base, percentual }: { base: number; percentual: number }) {
	return roundCents((Math.max(0, base) * clampAdjustmentPercent(percentual)) / 100);
}

type TPercentAdjustable = {
	descontoGeral: number;
	acrescimoGeral: number;
	descontoGeralPercentual: number | null;
	acrescimoGeralPercentual: number | null;
};

/**
 * Deriva `descontoGeral`/`acrescimoGeral` dos percentuais ativos. Sem percentual ativo, ou com o
 * valor já em dia, devolve o mesmo objeto: quem memoiza sobre o estado não re-renderiza à toa.
 */
export function applyPercentAdjustments<T extends TPercentAdjustable>(state: T, base: number): T {
	const safeBase = Math.max(0, base);
	const descontoGeral =
		state.descontoGeralPercentual === null
			? state.descontoGeral
			: Math.min(resolvePercentAdjustment({ base: safeBase, percentual: state.descontoGeralPercentual }), safeBase);
	const acrescimoGeral =
		state.acrescimoGeralPercentual === null
			? state.acrescimoGeral
			: resolvePercentAdjustment({ base: safeBase, percentual: state.acrescimoGeralPercentual });
	if (descontoGeral === state.descontoGeral && acrescimoGeral === state.acrescimoGeral) return state;
	return { ...state, descontoGeral, acrescimoGeral };
}

/**
 * Faixa em que o total responde linearmente ao desconto geral: `totalWithoutDiscount` é o total
 * com desconto geral zero, e `maxDiscount` o maior desconto antes de algum piso (`max(0, …)`)
 * entrar em ação. Fora dela, "desconto = total sem desconto − alvo" deixaria de valer.
 */
type TDiscountRange = { totalWithoutDiscount: number; maxDiscount: number };

export type TTargetTotalDiscount = { ok: true; discount: number } | { ok: false; reason: "ABOVE_TOTAL" | "BELOW_MINIMUM"; limit: number };

/** Desconto geral que leva o total a `target`. */
export function resolveTargetTotalDiscount({ totalWithoutDiscount, maxDiscount, target }: TDiscountRange & { target: number }): TTargetTotalDiscount {
	const discount = roundCents(totalWithoutDiscount - Math.max(0, target));
	if (discount < 0) return { ok: false, reason: "ABOVE_TOTAL", limit: roundCents(totalWithoutDiscount) };
	if (discount > roundCents(Math.max(0, maxDiscount))) {
		return { ok: false, reason: "BELOW_MINIMUM", limit: roundCents(totalWithoutDiscount - Math.max(0, maxDiscount)) };
	}
	return { ok: true, discount };
}

/** Tira os centavos do total atual. `null` quando não há centavos ou o desconto não caberia. */
export function resolveRoundDownDiscount({
	totalWithoutDiscount,
	maxDiscount,
	currentDiscount,
}: TDiscountRange & { currentDiscount: number }): { discount: number; total: number } | null {
	const currentTotal = roundCents(totalWithoutDiscount - currentDiscount);
	if (currentTotal <= 0) return null;
	const total = Math.floor(currentTotal + 1e-9);
	if (total === currentTotal) return null;
	const result = resolveTargetTotalDiscount({ totalWithoutDiscount, maxDiscount, target: total });
	return result.ok ? { discount: result.discount, total } : null;
}

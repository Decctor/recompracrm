// Conta da calculadora de cashback (/tools/cashback-calculator), a mesma do artigo
// "Cashback: quanto oferecer sem comer a sua margem". Por venda:
//   custo efetivo  c = ticket × cashback × uso   (crédito que expira não custa nada)
//   margem bruta   m = ticket × margem
// Se o programa traz uma fração f de vendas a mais entre os participantes, ele se paga quando
// f·m ≥ (1 + f)·c — o cashback também é pago sobre as vendas novas —, ou seja f ≥ c / (m − c).
// Percentuais entram como na tela (5 = 5%); frações saem como frações (0,15 = 15%).

export type TCashbackCalculatorInput = {
	/** Ticket médio, em reais. */
	ticket: number;
	/** Margem bruta, em % da venda. */
	margin: number;
	/** Cashback oferecido, em % da venda. */
	cashback: number;
	/** Parte do crédito que volta a ser usada, em %. */
	redemption: number;
	/** Vendas por mês com cliente identificado. */
	sales: number;
};

/** Acima desta parte da margem, a calculadora destaca o resultado. */
export const CASHBACK_MARGIN_SHARE_WARNING = 0.25;

/** Percentuais da tabela "Compare percentuais", além do escolhido. */
export const CASHBACK_COMPARE_LEVELS = [2, 3, 5, 7, 10, 15];

export const CASHBACK_CALCULATOR_DEFAULTS: TCashbackCalculatorInput = { ticket: 80, margin: 40, cashback: 5, redemption: 60, sales: 1000 };

export function computeCashbackPerSale(
	{ ticket, margin, redemption }: Pick<TCashbackCalculatorInput, "ticket" | "margin" | "redemption">,
	cashback: number,
) {
	const cost = ticket * (cashback / 100) * (redemption / 100);
	const grossMargin = ticket * (margin / 100);
	return {
		/** Custo real por venda: o crédito que de fato volta a ser usado. */
		cost,
		/** Margem bruta por venda, em reais. */
		grossMargin,
		/** Parte da margem que vira crédito usado (1 quando não há margem). */
		marginShare: grossMargin > 0 ? cost / grossMargin : 1,
		/** Vendas a mais (fração) para a margem total empatar; null quando o custo alcança a margem. */
		breakEven: grossMargin > cost ? cost / (grossMargin - cost) : null,
	};
}

export function computeCashbackCalculator(input: TCashbackCalculatorInput) {
	const perSale = computeCashbackPerSale(input, input.cashback);
	const levels = [...new Set([...CASHBACK_COMPARE_LEVELS, input.cashback])].sort((a, b) => a - b);
	return {
		...perSale,
		/** Crédito gerado por venda, antes de considerar o uso. */
		creditPerSale: input.ticket * (input.cashback / 100),
		monthlyCost: perSale.cost * input.sales,
		warning: perSale.marginShare > CASHBACK_MARGIN_SHARE_WARNING,
		compare: levels.map((cashback) => {
			const row = computeCashbackPerSale(input, cashback);
			return { cashback, ...row, selected: cashback === input.cashback, warning: row.marginShare > CASHBACK_MARGIN_SHARE_WARNING };
		}),
	};
}

export type TCashbackCalculatorResult = ReturnType<typeof computeCashbackCalculator>;

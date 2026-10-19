/** Janela do consumo médio diário, em dias. */
export const CONSUMPTION_WINDOW_DAYS = 30;

/** Uma saída é atípica quando, sozinha, alcança este múltiplo do consumo médio diário. */
export const ATYPICAL_SALE_MULTIPLIER = 3;

export type TConsumptionLine = {
	/** Dia local da saída (`YYYY-MM-DD`). */
	dia: string;
	quantidade: number;
};

/**
 * Consumo médio diário sem saídas atípicas.
 *
 * Uma linha de saída (um item de venda, uma baixa de produção) que sozinha chega a 3× a média bruta
 * da janela é atípica: entra no gráfico como "Grande venda", mas fica fora da média e do desvio,
 * para que uma encomenda pontual não infle o ponto de pedido dos meses seguintes. Linhas de uma
 * unidade nunca são atípicas — com consumo baixo qualquer venda passaria do limite.
 */
export function resolveConsumption({ lines, days }: { lines: TConsumptionLine[]; days: string[] }) {
	const dayCount = Math.max(1, days.length);
	const rawTotal = lines.reduce((sum, line) => sum + line.quantidade, 0);
	const rawAverage = rawTotal / dayCount;
	const atypicalThreshold = rawAverage * ATYPICAL_SALE_MULTIPLIER;
	const isAtypical = (quantidade: number) => rawAverage > 0 && quantidade > 1 && quantidade >= atypicalThreshold;

	const perDay = new Map<string, number>(days.map((day) => [day, 0]));
	let atypicalCount = 0;
	for (const line of lines) {
		if (isAtypical(line.quantidade)) {
			atypicalCount += 1;
			continue;
		}
		if (perDay.has(line.dia)) perDay.set(line.dia, (perDay.get(line.dia) ?? 0) + line.quantidade);
	}

	const values = [...perDay.values()];
	const average = values.reduce((sum, value) => sum + value, 0) / dayCount;
	const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / dayCount;

	return {
		consumoMedioDia: average,
		desvioPadrao: Math.sqrt(variance),
		/** Quantidade a partir da qual uma única saída é atípica; `null` sem consumo na janela. */
		limiteAtipico: rawAverage > 0 ? Math.max(2, atypicalThreshold) : null,
		saidasAtipicas: atypicalCount,
	};
}
export type TConsumption = ReturnType<typeof resolveConsumption>;

/** Cobertura em dias (saldo ÷ consumo). `null` quando não há consumo — o saldo não acaba. */
export function resolveCoverageDays(balance: number, dailyConsumption: number) {
	if (dailyConsumption <= 0) return null;
	return Math.max(0, balance) / dailyConsumption;
}

/**
 * Saldo médio de uma série diária reconstruída de trás para frente.
 *
 * Com saldos de fim de dia `b(0..N-1)` e `b(N-1) = saldoFinal`, `b(d) = saldoFinal − Σ δ(t)` para as
 * movimentações dos dias posteriores a `d`. Somando os N dias: `Σ b = N·saldoFinal − Σ δ(t)·dia(t)`,
 * em que `dia(t)` é o índice (0-based) do dia da movimentação. O SQL agrega `Σ δ·dia` direto, sem
 * materializar a série por produto.
 */
export function resolveAverageBalance({
	finalBalance,
	weightedDeltaSum,
	dayCount,
}: {
	finalBalance: number;
	weightedDeltaSum: number;
	dayCount: number;
}) {
	if (dayCount <= 0) return finalBalance;
	return finalBalance - weightedDeltaSum / dayCount;
}

/** Giro no período: saídas ÷ saldo médio. `null` quando o saldo médio não é positivo. */
export function resolveTurnover(outflow: number, averageBalance: number) {
	if (averageBalance <= 0) return null;
	return outflow / averageBalance;
}

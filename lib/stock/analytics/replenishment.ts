/** Prazo de reposição assumido quando o produto não tem compra com data de pedido e de recebimento. */
export const DEFAULT_LEAD_TIME_DAYS = 7;
/** Quantas compras recebidas entram na média do prazo de reposição. */
export const LEAD_TIME_SAMPLE_SIZE = 6;
/** Fator z de 95% de nível de serviço. */
export const SERVICE_LEVEL_Z = 1.65;
/** Dias de consumo que a compra sugerida cobre depois da entrega. */
export const SUGGESTION_COVERAGE_DAYS = 15;

export type TLeadTimeSample = { pedidoData: Date; recebimentoData: Date };

/**
 * Prazo médio de reposição (pedido → recebimento) das últimas compras recebidas.
 * Sem amostra válida, cai no padrão de 7 dias e avisa pela `origem`.
 */
export function resolveLeadTime(samples: TLeadTimeSample[]) {
	const valid = samples
		.filter((sample) => sample.recebimentoData.getTime() >= sample.pedidoData.getTime())
		.sort((a, b) => b.recebimentoData.getTime() - a.recebimentoData.getTime())
		.slice(0, LEAD_TIME_SAMPLE_SIZE);
	if (valid.length === 0) return { prazoDias: DEFAULT_LEAD_TIME_DAYS, origem: "PADRAO" as const, compras: 0 };
	const days = valid.map((sample) => (sample.recebimentoData.getTime() - sample.pedidoData.getTime()) / 86_400_000);
	const average = days.reduce((sum, value) => sum + value, 0) / days.length;
	return { prazoDias: Math.max(1, Math.round(average)), origem: "COMPRAS" as const, compras: valid.length };
}

/**
 * Estoque de segurança, ponto de pedido e compra sugerida.
 * - Segurança = z × σ(consumo diário) × √prazo
 * - Ponto de pedido = consumo × prazo + segurança
 * - Sugestão = consumo × (prazo + 15) + segurança − saldo
 */
export function resolveReorderPoint({
	dailyConsumption,
	dailyStdDev,
	leadTimeDays,
	balance,
}: {
	dailyConsumption: number;
	dailyStdDev: number;
	leadTimeDays: number;
	balance: number;
}) {
	const estoqueSeguranca = Math.round(SERVICE_LEVEL_Z * dailyStdDev * Math.sqrt(leadTimeDays));
	const pontoPedido = Math.round(dailyConsumption * leadTimeDays + estoqueSeguranca);
	const sugestao = Math.max(0, Math.round(dailyConsumption * (leadTimeDays + SUGGESTION_COVERAGE_DAYS) + estoqueSeguranca - balance));
	return {
		estoqueSeguranca,
		pontoPedido,
		sugestao,
		/** Só há o que repor quando existe consumo e o saldo chegou ao ponto de pedido. */
		abaixoPontoPedido: dailyConsumption > 0 && balance <= pontoPedido,
	};
}

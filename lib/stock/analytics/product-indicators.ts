import { resolveAverageBalance, resolveCoverageDays, resolveTurnover } from "./consumption";
import { getAbcRanking, getConsumptionByProduct, getLeadTimeByProduct, getProductMovementSummaries, getStockPositions } from "./queries";
import { resolveReorderPoint } from "./replenishment";

/**
 * Indicadores de reposição de todos os produtos rastreados: consumo (30 dias, sem atípicas),
 * cobertura, giro no período, prazo de reposição, segurança, ponto de pedido e classe ABC por
 * faturamento no período. Base das seções "Giro e cobertura" e "Ponto de pedido".
 */
export async function getProductStockIndicators({ organizationId, after, before }: { organizationId: string; after: Date; before: Date }) {
	const now = new Date();
	const [positions, consumption, leadTimes, movement, abc] = await Promise.all([
		getStockPositions({ organizationId }),
		getConsumptionByProduct({ organizationId, now }),
		getLeadTimeByProduct({ organizationId }),
		getProductMovementSummaries({ organizationId, after, before: now }),
		getAbcRanking({ organizationId, after, before, metric: "FATURAMENTO" }),
	]);

	return positions.map((position) => {
		const consumo = consumption.byProductId.get(position.produtoId) ?? consumption.empty;
		const leadTime = leadTimes.get(position.produtoId);
		const productMovement = movement.byProductId.get(position.produtoId);
		const saldoMedio = resolveAverageBalance({
			finalBalance: position.saldo,
			weightedDeltaSum: productMovement?.variacaoPonderada ?? 0,
			dayCount: movement.dayCount,
		});
		const reorder = resolveReorderPoint({
			dailyConsumption: consumo.consumoMedioDia,
			dailyStdDev: consumo.desvioPadrao,
			leadTimeDays: leadTime.prazoDias,
			balance: position.saldo,
		});
		const custoUnitario = position.saldo > 0 ? position.valor / position.saldo : (position.precoCusto ?? 0);
		return {
			produtoId: position.produtoId,
			nome: position.nome,
			codigo: position.codigo,
			grupo: position.grupo,
			unidade: position.unidade,
			saldo: position.saldo,
			custoUnitario,
			classe: abc.byProductId.get(position.produtoId)?.classe ?? ("C" as const),
			consumoMedioDia: consumo.consumoMedioDia,
			coberturaDias: resolveCoverageDays(position.saldo, consumo.consumoMedioDia),
			giro: resolveTurnover(productMovement?.saidas ?? 0, saldoMedio),
			prazoReposicaoDias: leadTime.prazoDias,
			prazoReposicaoOrigem: leadTime.origem,
			...reorder,
		};
	});
}
export type TProductStockIndicator = Awaited<ReturnType<typeof getProductStockIndicators>>[number];

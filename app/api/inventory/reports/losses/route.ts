import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { bucketDailySeries, monthKeyOf, weekKeyOf } from "@/lib/stock/analytics/balance-series";
import { inferStockLossReason, STOCK_LOSS_REASONS, type TStockLossReason } from "@/lib/stock/analytics/loss-reasons";
import { listLocalDayKeys } from "@/lib/stock/analytics/periods";
import { getStockLosses } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

/** Acima disto as barras semanais ficam finas demais; vira uma barra por mês. */
const WEEKLY_BARS_LIMIT_DAYS = 120;
const TOP_PRODUCTS = 3;

const GetStockReportLossesInputSchema = StockReportPeriodInputSchema;
export type TGetStockReportLossesInput = z.infer<typeof GetStockReportLossesInputSchema>;

/**
 * Perdas e descartes do período: descartes e ajustes negativos de recontagem, valorizados ao custo
 * unitário da movimentação. Compara com o período imediatamente anterior, de mesma duração.
 */
async function getStockReportLosses({ input, organizationId }: { input: TGetStockReportLossesInput; organizationId: string }) {
	const span = input.periodBefore.getTime() - input.periodAfter.getTime();
	const previousAfter = new Date(input.periodAfter.getTime() - span);
	const [losses, previousLosses] = await Promise.all([
		getStockLosses({ organizationId, after: input.periodAfter, before: input.periodBefore }),
		getStockLosses({ organizationId, after: previousAfter, before: input.periodAfter }),
	]);

	const days = listLocalDayKeys(input.periodAfter, input.periodBefore);
	const valueByDay = new Map(days.map((dia) => [dia, 0]));
	const byReason = new Map<TStockLossReason, number>();
	const byProduct = new Map<string, { produtoId: string; nome: string; quantidade: number; valor: number }>();
	for (const loss of losses) {
		valueByDay.set(loss.dia, (valueByDay.get(loss.dia) ?? 0) + loss.valor);
		const reason = inferStockLossReason({
			tipo: loss.tipo,
			dataMovimentacao: new Date(loss.data),
			loteDataValidade: loss.loteDataValidade ? new Date(loss.loteDataValidade) : null,
		});
		byReason.set(reason, (byReason.get(reason) ?? 0) + loss.valor);
		const product = byProduct.get(loss.produtoId) ?? { produtoId: loss.produtoId, nome: loss.produtoNome, quantidade: 0, valor: 0 };
		product.quantidade += loss.quantidade;
		product.valor += loss.valor;
		byProduct.set(loss.produtoId, product);
	}

	const granularidade = days.length > WEEKLY_BARS_LIMIT_DAYS ? ("MES" as const) : ("SEMANA" as const);
	const daily = days.map((dia) => ({ dia, valor: valueByDay.get(dia) ?? 0 }));
	const serie = bucketDailySeries(daily, granularidade === "MES" ? monthKeyOf : weekKeyOf, (bucket) => ({
		valor: bucket.reduce((sum, item) => sum + item.valor, 0),
	}));

	return {
		data: {
			total: losses.reduce((sum, loss) => sum + loss.valor, 0),
			anterior: previousLosses.reduce((sum, loss) => sum + loss.valor, 0),
			granularidade,
			serie,
			porMotivo: [...byReason.entries()]
				.map(([motivo, valor]) => ({ motivo, rotulo: STOCK_LOSS_REASONS[motivo], valor }))
				.sort((a, b) => b.valor - a.valor),
			produtos: [...byProduct.values()].sort((a, b) => b.valor - a.valor).slice(0, TOP_PRODUCTS),
		},
		message: "Perdas e descartes obtidos com sucesso.",
	};
}
export type TGetStockReportLossesOutput = Awaited<ReturnType<typeof getStockReportLosses>>;

async function getStockReportLossesRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetStockReportLossesInputSchema.parse(parsePeriodSearchParams(request.nextUrl.searchParams));
	const result = await getStockReportLosses({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportLossesRoute });

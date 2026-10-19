import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { buildBackwardSeries, bucketDailySeries, weekKeyOf } from "@/lib/stock/analytics/balance-series";
import { inferStockLossReason, STOCK_LOSS_REASONS } from "@/lib/stock/analytics/loss-reasons";
import { listLocalDayKeys } from "@/lib/stock/analytics/periods";
import { getPurchaseEntries, getStockDeltasByDay, getStockLosses, getStockPositions } from "@/lib/stock/analytics/queries";
import { getSessionOrganizationId, parsePeriodSearchParams, StockReportPeriodInputSchema } from "@/lib/stock/analytics/route-helpers";
import { type NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

/** Compras marcadas no gráfico: as de maior valor no período, para os marcadores não se sobreporem. */
const MAX_PURCHASE_MARKERS = 8;
/** Perdas relevantes: os dias com maior valor descartado no período. */
const MAX_LOSS_MARKERS = 5;
const ITEMS_PER_EVENT = 3;
/** Acima disto, um ponto por semana (o valor do fim da semana) mantém a linha legível. */
const DAILY_POINTS_LIMIT = 120;

const GetStockReportValueInputSchema = StockReportPeriodInputSchema;
export type TGetStockReportValueInput = z.infer<typeof GetStockReportValueInputSchema>;

/**
 * Evolução do valor imobilizado (saldo × custo médio) no período, reconstruída a partir do valor de
 * hoje, com as compras e as perdas relevantes como eventos.
 */
async function getStockReportValue({ input, organizationId }: { input: TGetStockReportValueInput; organizationId: string }) {
	const now = new Date();
	const before = input.periodBefore.getTime() > now.getTime() ? now : input.periodBefore;
	const [positions, deltasByDay, purchaseEntries, losses] = await Promise.all([
		getStockPositions({ organizationId }),
		// As variações até hoje: a série é ancorada no valor atual e desfeita até o início do período.
		getStockDeltasByDay({ organizationId, after: input.periodAfter, before: now }),
		getPurchaseEntries({ organizationId, after: input.periodAfter, before }),
		getStockLosses({ organizationId, after: input.periodAfter, before }),
	]);
	const currentValue = positions.reduce((sum, position) => sum + position.valor, 0);
	const allDays = listLocalDayKeys(input.periodAfter, now);
	const valueDeltaByDay = new Map([...deltasByDay].map(([dia, delta]) => [dia, delta.valor]));
	const lastDay = listLocalDayKeys(before, before)[0];
	const daily = buildBackwardSeries({ days: allDays, currentValue, deltaByDay: valueDeltaByDay }).filter((point) => point.dia <= lastDay);

	const granularidade = daily.length > DAILY_POINTS_LIMIT ? ("SEMANA" as const) : ("DIA" as const);
	const serie =
		granularidade === "SEMANA"
			? bucketDailySeries(daily, weekKeyOf, (bucket) => ({ valor: bucket[bucket.length - 1].valor })).map((point) => ({
					dia: point.fim,
					inicio: point.inicio,
					valor: point.valor,
				}))
			: daily.map((point) => ({ dia: point.dia, inicio: point.dia, valor: point.valor }));

	const purchasesById = new Map<
		string,
		{
			id: string;
			data: number;
			dia: string;
			origem: string;
			descricao: string | null;
			itens: { nome: string; quantidade: number; valor: number }[];
			total: number;
		}
	>();
	for (const entry of purchaseEntries) {
		const purchase = purchasesById.get(entry.compraId) ?? {
			id: entry.compraId,
			data: entry.data,
			dia: entry.dia,
			origem: entry.compraTitulo,
			descricao: entry.fornecedor,
			itens: [],
			total: 0,
		};
		const valor = entry.quantidade * (entry.custoUnitario ?? 0);
		purchase.itens.push({
			nome: entry.varianteNome ? `${entry.produtoNome} · ${entry.varianteNome}` : entry.produtoNome,
			quantidade: entry.quantidade,
			valor,
		});
		purchase.total += valor;
		purchase.data = Math.min(purchase.data, entry.data);
		if (entry.dia < purchase.dia) purchase.dia = entry.dia;
		purchasesById.set(entry.compraId, purchase);
	}
	const compras = [...purchasesById.values()]
		.sort((a, b) => b.total - a.total)
		.slice(0, MAX_PURCHASE_MARKERS)
		.map((purchase) => ({
			id: `compra-${purchase.id}`,
			tipo: "COMPRA" as const,
			data: purchase.data,
			dia: purchase.dia,
			origem: purchase.origem,
			descricao: purchase.descricao,
			itens: purchase.itens.sort((a, b) => b.valor - a.valor).slice(0, ITEMS_PER_EVENT),
			itensTotal: purchase.itens.length,
			total: purchase.total,
		}));

	type TLossDay = { data: number; itens: { nome: string; quantidade: number; valor: number }[]; total: number; motivos: Map<string, number> };
	const lossesByDay = new Map<string, TLossDay>();
	for (const loss of losses) {
		const day: TLossDay = lossesByDay.get(loss.dia) ?? { data: loss.data, itens: [], total: 0, motivos: new Map() };
		const reason =
			STOCK_LOSS_REASONS[
				inferStockLossReason({
					tipo: loss.tipo,
					dataMovimentacao: new Date(loss.data),
					loteDataValidade: loss.loteDataValidade ? new Date(loss.loteDataValidade) : null,
				})
			];
		day.itens.push({
			nome: loss.varianteNome ? `${loss.produtoNome} · ${loss.varianteNome}` : loss.produtoNome,
			quantidade: loss.quantidade,
			valor: loss.valor,
		});
		day.total += loss.valor;
		day.motivos.set(reason, (day.motivos.get(reason) ?? 0) + loss.valor);
		lossesByDay.set(loss.dia, day);
	}
	const perdas = [...lossesByDay.entries()]
		.filter(([, day]) => day.total > 0)
		.sort((a, b) => b[1].total - a[1].total)
		.slice(0, MAX_LOSS_MARKERS)
		.map(([dia, day]) => {
			const motivos = [...day.motivos.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason);
			return {
				id: `perda-${dia}`,
				tipo: "PERDA" as const,
				data: day.data,
				dia,
				origem: motivos[0] ?? STOCK_LOSS_REASONS.DESCARTE_MANUAL,
				descricao: motivos.length > 1 ? motivos.join(" · ") : null,
				itens: day.itens.sort((a, b) => b.valor - a.valor).slice(0, ITEMS_PER_EVENT),
				itensTotal: day.itens.length,
				total: -day.total,
			};
		});

	return {
		data: {
			hoje: currentValue,
			granularidade,
			serie,
			eventos: [...compras, ...perdas].sort((a, b) => a.data - b.data),
		},
		message: "Evolução do valor imobilizado obtida com sucesso.",
	};
}
export type TGetStockReportValueOutput = Awaited<ReturnType<typeof getStockReportValue>>;

async function getStockReportValueRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const input = GetStockReportValueInputSchema.parse(parsePeriodSearchParams(request.nextUrl.searchParams));
	const result = await getStockReportValue({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockReportValueRoute });

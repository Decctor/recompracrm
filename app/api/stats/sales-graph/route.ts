import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { getChartBuckets, shiftChartBuckets, type TChartBucket } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { resolveGoalShareForWindow } from "@/lib/goals/pacing";
import { buildOrganizationPacingCurve } from "@/lib/goals/resolve-active-goal-pacing";
import { assertSellersIdsWithinResultsScope } from "@/lib/permissions/results-scope";
import { SalesGraphFilterSchema, type TSalesGraphFilters } from "@/schemas/query-params-utils";

import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, exists, gte, inArray, lte, notInArray, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import type { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

export type TSalesGraphInput = z.infer<typeof SalesGraphFilterSchema>;

export type TSalesGraphOutput = {
	titulo: string;
	ATUAL: {
		qtde: number;
		total: number;
	};
	ANTERIOR: {
		qtde: number;
		total: number;
	};
	meta: number;
}[];
async function fetchSalesGraph(filters: TSalesGraphFilters, organizacaoId: string) {
	const currentPeriodAjusted = {
		after: new Date(filters.period.after),
		before: new Date(filters.period.before),
	};
	const shiftToPreviousYear = (date: Date) => dayjs(date).subtract(1, "year").toDate();
	const previousYearPeriodAjusted = {
		after: shiftToPreviousYear(currentPeriodAjusted.after),
		before: shiftToPreviousYear(currentPeriodAjusted.before),
	};
	// Intervalos de calendário (um ano inteiro = 12 meses). O ano anterior usa os MESMOS intervalos
	// deslocados, casados por posição: o ponto "03/2026" compara com março de 2025.
	const currentPeriodBuckets = getChartBuckets({ startDate: currentPeriodAjusted.after, endDate: currentPeriodAjusted.before });
	const previousYearPeriodBuckets = shiftChartBuckets(currentPeriodBuckets, shiftToPreviousYear);

	const [currentPeriodSales, salesGoal, previousYearPeriodSales] = await Promise.all([
		getSalesGrouped({
			filters: { ...filters, period: { after: currentPeriodAjusted.after.toISOString(), before: currentPeriodAjusted.before.toISOString() } },
			organizacaoId,
			buckets: currentPeriodBuckets,
		}),
		getSalesGoal({ after: currentPeriodAjusted.after.toISOString(), before: currentPeriodAjusted.before.toISOString(), organizacaoId }),
		getSalesGrouped({
			filters: { ...filters, period: { after: previousYearPeriodAjusted.after.toISOString(), before: previousYearPeriodAjusted.before.toISOString() } },
			organizacaoId,
			buckets: previousYearPeriodBuckets,
		}),
	]);

	const salesGraph: TSalesGraphOutput = currentPeriodBuckets.map((bucket) => ({
		titulo: bucket.label,
		ATUAL: { qtde: 0, total: 0 },
		ANTERIOR: { qtde: 0, total: 0 },
		meta: currentPeriodBuckets.length > 0 ? salesGoal / currentPeriodBuckets.length : 0,
	}));
	// `posicao` é 1-based (0 = antes do primeiro intervalo).
	for (const row of currentPeriodSales) {
		const point = salesGraph[Number(row.posicao) - 1];
		if (!point) continue;
		point.ATUAL.qtde += Number(row.quantidade);
		point.ATUAL.total += Number(row.valorTotal);
	}
	for (const row of previousYearPeriodSales) {
		const point = salesGraph[Number(row.posicao) - 1];
		if (!point) continue;
		point.ANTERIOR.qtde += Number(row.quantidade);
		point.ANTERIOR.total += Number(row.valorTotal);
	}

	return salesGraph;
}

const handleGetStatsComparisonRoute: PagesRouteHandler<{
	data: TSalesGraphOutput;
}> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgMembership = sessionUser.membership;
	const userOrgId = userOrgMembership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const filters = SalesGraphFilterSchema.parse(req.body);

	await assertSellersIdsWithinResultsScope({
		organizacaoId: userOrgId,
		resultsScope: userOrgMembership.permissoes.resultados.escopo,
		sellersIds: filters.sellersIds,
	});

	const salesGraph = await fetchSalesGraph(filters, userOrgId);

	return res.status(200).json({
		data: salesGraph,
	});
};

const routeHandlers = {
	POST: handleGetStatsComparisonRoute,
	GET: handleGetStatsComparisonRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET!, bodyFromSearchParam: "payload" }),
});

type GetSalesGroupedParams = {
	filters: TSalesGraphFilters;
	organizacaoId: string;
	buckets: TChartBucket[];
};
async function getSalesGrouped({ filters, organizacaoId, buckets }: GetSalesGroupedParams) {
	const ajustedAfter = filters.period.after ? dayjs(filters.period.after).toDate() : null;
	// Fim do dia em São Paulo — no fuso do servidor (UTC) o "fim do dia" avançava 21h no dia seguinte.
	const ajustedBefore = filters.period.before ? dayjs(filters.period.before).tz(OPERATION_TIMEZONE).endOf("day").toDate() : null;
	try {
		const conditions = [eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA")];
		if (ajustedAfter) conditions.push(gte(sales.dataVenda, ajustedAfter));
		if (ajustedBefore) conditions.push(lte(sales.dataVenda, ajustedBefore));
		if (filters.total.min) conditions.push(gte(sales.valorTotal, filters.total.min));
		if (filters.total.max) conditions.push(lte(sales.valorTotal, filters.total.max));

		const integrationCondition = getSalesIntegrationCondition(filters.integrationsIds);
		if (integrationCondition) conditions.push(integrationCondition);

		if (filters.sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, filters.sellersIds));

		if (filters.clientRFMTitles.length > 0)
			conditions.push(
				exists(
					db
						.select({ id: clients.id })
						.from(clients)
						.where(
							and(eq(clients.organizacaoId, organizacaoId), eq(clients.id, sales.clienteId), inArray(clients.analiseRFMTitulo, filters.clientRFMTitles)),
						),
				),
			);
		if (filters.excludedSalesIds) conditions.push(notInArray(sales.id, filters.excludedSalesIds));

		// Uma linha por intervalo do gráfico, já no calendário de São Paulo (não por dia UTC).
		const bucketPosition = chartBucketPositionSql(sales.dataVenda, buckets);
		const salesResult = await db
			.select({
				posicao: bucketPosition,
				quantidade: sql<number>`count(*)`,
				valorTotal: sql<number>`sum(${sales.valorTotal})`,
			})
			.from(sales)
			.where(and(...conditions))
			.groupBy(bucketPosition);

		return salesResult;
	} catch (error) {
		console.log("Error getting sales", error);
		throw error;
	}
}

type GetSalesGoalProps = {
	after: string;
	before: string;
	organizacaoId: string;
};

/**
 * Parcela das metas da organização que cai dentro da janela filtrada.
 *
 * A repartição passa pela curva de ritmo, não por regra de três em dias corridos: uma janela de
 * segunda a sexta numa loja que fatura no fim de semana recebia meta demais, e a versão anterior
 * ainda contava os dias com `+1` num ramo e sem no outro.
 *
 * A query busca metas que **cruzam** a janela — a versão anterior só pegava metas cujo início ou
 * fim caísse dentro dela, então uma meta trimestral desaparecia ao filtrar um mês do meio.
 */
async function getSalesGoal({ after, before, organizacaoId }: GetSalesGoalProps) {
	const janela = { inicio: dayjs(after).startOf("day").toDate(), fim: dayjs(before).endOf("day").toDate() };

	const applicableGoals = await db.query.goals.findMany({
		where: (fields, { and, eq, gte, lte }) =>
			and(eq(fields.organizacaoId, organizacaoId), lte(fields.dataInicio, janela.fim), gte(fields.dataFim, janela.inicio)),
	});
	if (applicableGoals.length === 0) return 0;

	const agora = new Date();
	const shares = await Promise.all(
		applicableGoals.map(async (goal) => {
			const curva = await buildOrganizationPacingCurve({
				organizacaoId,
				dataInicio: goal.dataInicio,
				dataFim: goal.dataFim,
				agora,
			});
			return goal.objetivoValor * resolveGoalShareForWindow({ curva, janela });
		}),
	);

	return shares.reduce((acc, share) => acc + share, 0);
}

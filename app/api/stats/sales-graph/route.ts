import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import {
	getBestNumberOfPointsBetweenDates,
	getDateBuckets,
	getDayStringsBetweenDates,
	getEvenlySpacedDates,
	getYearStringsBetweenDates,
} from "@/lib/dates";
import { resolveGoalShareForWindow } from "@/lib/goals/pacing";
import { buildOrganizationPacingCurve } from "@/lib/goals/resolve-active-goal-pacing";
import { assertSellersIdsWithinResultsScope } from "@/lib/permissions/results-scope";
import { SalesGraphFilterSchema, type TSalesGraphFilters } from "@/schemas/query-params-utils";

import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, exists, gte, inArray, lte, notInArray, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import type { z } from "zod";

export type TSalesGraphInput = z.infer<typeof SalesGraphFilterSchema>;

type TSalesGraphReduced = {
	[key: string]: {
		ATUAL: {
			qtde: number;
			total: number;
		};
		ANTERIOR: {
			qtde: number;
			total: number;
		};
	};
};
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
	const previousYearPeriodAjusted = {
		after: dayjs(currentPeriodAjusted.after).subtract(1, "year").toDate(),
		before: dayjs(currentPeriodAjusted.before).subtract(1, "year").toDate(),
	};
	const { points: bestNumberOfPointsForPeriodsDates, groupingFormat } = getBestNumberOfPointsBetweenDates({
		startDate: currentPeriodAjusted.after,
		endDate: currentPeriodAjusted.before,
	});
	const currentPeriodDatesStrs = getEvenlySpacedDates({
		startDate: currentPeriodAjusted.after,
		endDate: currentPeriodAjusted.before,
		points: bestNumberOfPointsForPeriodsDates,
	});

	const currentPeriodDateBuckets = getDateBuckets(currentPeriodDatesStrs);

	const currentPeriodSales = await getSalesGrouped({
		filters: {
			...filters,
			period: {
				after: currentPeriodAjusted.after.toISOString(),
				before: currentPeriodAjusted.before.toISOString(),
			},
		},
		organizacaoId,
	});

	const salesGoal = await getSalesGoal({
		after: currentPeriodAjusted.after.toISOString(),
		before: currentPeriodAjusted.before.toISOString(),
		organizacaoId,
	});

	const previousYearPeriodDatesStrs = getEvenlySpacedDates({
		startDate: previousYearPeriodAjusted.after,
		endDate: previousYearPeriodAjusted.before,
		points: bestNumberOfPointsForPeriodsDates,
	});

	const previousYearPeriodDateBuckets = getDateBuckets(previousYearPeriodDatesStrs);

	const previousYearPeriodSales = await getSalesGrouped({
		filters: {
			...filters,
			period: {
				after: previousYearPeriodAjusted.after.toISOString(),
				before: previousYearPeriodAjusted.before.toISOString(),
			},
		},
		organizacaoId,
	});

	const initialSalesReduced: TSalesGraphReduced = Object.fromEntries(
		previousYearPeriodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { ATUAL: { qtde: 0, total: 0 }, ANTERIOR: { qtde: 0, total: 0 } }]),
	);

	const currentPeriodSalesReduced = currentPeriodSales.reduce((acc: TSalesGraphReduced, current) => {
		const saleDate = new Date(current.dataVenda);
		const saleTime = saleDate.getTime();
		// Finding the correct - O(1) in average
		const bucket = currentPeriodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
		if (!bucket) return acc;
		// updating daily statistics
		const key = dayjs(bucket.key).format(groupingFormat);
		if (!acc[key]) acc[key] = { ATUAL: { qtde: 0, total: 0 }, ANTERIOR: { qtde: 0, total: 0 } };

		acc[key].ATUAL.qtde += Number(current.quantidade);
		acc[key].ATUAL.total += Number(current.valorTotal);
		return acc;
	}, initialSalesReduced);

	const salesGraphReduced = previousYearPeriodSales.reduce((acc: TSalesGraphReduced, current) => {
		const saleDate = new Date(current.dataVenda);
		const saleTime = saleDate.getTime();
		// Finding the correct - O(1) in average
		const bucket = previousYearPeriodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
		if (!bucket) return acc;

		// updating daily statistics
		const key = dayjs(bucket.key).format(groupingFormat);

		if (!acc[key]) acc[key] = { ATUAL: { qtde: 0, total: 0 }, ANTERIOR: { qtde: 0, total: 0 } };

		acc[key].ANTERIOR.qtde += Number(current.quantidade);
		acc[key].ANTERIOR.total += Number(current.valorTotal);
		return acc;
	}, currentPeriodSalesReduced);

	const salesGraph: TSalesGraphOutput = Object.entries(salesGraphReduced).map(([key, value], i, arr) => ({
		titulo: key,
		ANTERIOR: value.ANTERIOR,
		ATUAL: value.ATUAL,
		meta: salesGoal / arr.length,
	}));

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
};
async function getSalesGrouped({ filters, organizacaoId }: GetSalesGroupedParams) {
	const ajustedAfter = filters.period.after ? dayjs(filters.period.after).toDate() : null;
	const ajustedBefore = filters.period.before ? dayjs(filters.period.before).endOf("day").toDate() : null;
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

		const salesResult = await db
			.select({
				dataVenda: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
				quantidade: sql<number>`count(*)`,
				valorTotal: sql<number>`sum(${sales.valorTotal})`,
			})
			.from(sales)
			.where(and(...conditions))
			.groupBy(sql`date_trunc('day', ${sales.dataVenda})`)
			.orderBy(sql`date_trunc('day', ${sales.dataVenda})`);

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

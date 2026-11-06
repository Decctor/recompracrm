import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets, getChartGranularity, type TChartBucket } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, asc, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetClientsGraphInputSchema = z.object({
	graphType: z.enum(["new-clients", "clients-growth", "active-clients"], {
		required_error: "Tipo de gráfico não informado.",
		invalid_type_error: "Tipo inválido para tipo de gráfico.",
	}),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
	comparingPeriodAfter: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).startOf("day").toDate() : undefined)),
	comparingPeriodBefore: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).tz(OPERATION_TIMEZONE).endOf("day").toDate() : undefined)),
});

export type TGetClientsGraphInput = z.infer<typeof GetClientsGraphInputSchema>;

/** Total de cada intervalo a partir das linhas agrupadas por intervalo (`chartBucketPositionSql`, 1-based). */
function getBucketTotals(buckets: TChartBucket[], rows: Array<{ position: number; total: unknown }>): number[] {
	const byPosition = new Map(rows.map((row) => [Number(row.position), row]));
	return buckets.map((_, index) => Number(byPosition.get(index + 1)?.total ?? 0));
}

async function getGraphDataForPeriod({
	graphType,
	period,
	buckets,
	userOrgId,
}: {
	graphType: "new-clients" | "clients-growth" | "active-clients";
	period: { after: Date; before: Date };
	buckets: TChartBucket[];
	userOrgId: string;
}): Promise<Array<{ label: string; value: number }>> {
	// Graph Type: new-clients (non-cumulative, new clients per period)
	if (graphType === "new-clients") {
		const newClients = await db
			.select({
				position: chartBucketPositionSql(clients.primeiraCompraData, buckets),
				total: sql<number>`COUNT(*)`,
			})
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), gte(clients.primeiraCompraData, period.after), lte(clients.primeiraCompraData, period.before)))
			.groupBy(chartBucketPositionSql(clients.primeiraCompraData, buckets));

		const totals = getBucketTotals(buckets, newClients);
		return buckets.map((bucket, index) => ({ label: bucket.label, value: totals[index] }));
	}

	// Graph Type: clients-growth (cumulative, total clients over time)
	if (graphType === "clients-growth") {
		// Get total clients BEFORE the period starts
		const clientsBeforePeriod = await db
			.select({
				total: sql<number>`COUNT(*)`,
			})
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), lte(clients.primeiraCompraData, period.after)));

		const initialTotal = Number(clientsBeforePeriod[0]?.total || 0);

		const clientsGrowth = await db
			.select({
				position: chartBucketPositionSql(clients.primeiraCompraData, buckets),
				total: sql<number>`COUNT(*)`,
			})
			.from(clients)
			.where(and(eq(clients.organizacaoId, userOrgId), gte(clients.primeiraCompraData, period.after), lte(clients.primeiraCompraData, period.before)))
			.groupBy(chartBucketPositionSql(clients.primeiraCompraData, buckets));

		const totals = getBucketTotals(buckets, clientsGrowth);

		// Transform into cumulative values
		let accumulated = initialTotal;
		return buckets.map((bucket, index) => {
			accumulated += totals[index];
			return {
				label: bucket.label,
				value: accumulated,
			};
		});
	}

	// Graph Type: active-clients (clients who made purchases in the period)
	if (graphType === "active-clients") {
		const activeClients = await db
			.select({
				position: chartBucketPositionSql(sales.dataVenda, buckets),
				total: countDistinct(sales.clienteId),
			})
			.from(sales)
			.where(
				and(
					eq(sales.organizacaoId, userOrgId),
					gte(sales.dataVenda, period.after),
					lte(sales.dataVenda, period.before),
					eq(sales.statusVenda, "CONFIRMADA"),
				),
			)
			.groupBy(chartBucketPositionSql(sales.dataVenda, buckets));

		const totals = getBucketTotals(buckets, activeClients);
		return buckets.map((bucket, index) => ({ label: bucket.label, value: totals[index] }));
	}

	return [];
}

async function getClientsGraph({ input, sessionUser }: { input: TGetClientsGraphInput; sessionUser: TAuthUserSession }) {
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const period = {
		after: input.periodAfter,
		before: input.periodBefore,
	};

	console.log(`[ORG: ${userOrgId}] [INFO] [GET CLIENTS GRAPH] Period:`, period);

	// If no start period, get the first client registration date
	if (!period.after) {
		const firstClient = await db
			.select({
				date: clients.primeiraCompraData,
			})
			.from(clients)
			.where(eq(clients.organizacaoId, userOrgId))
			.orderBy(asc(clients.primeiraCompraData))
			.limit(1);
		const firstClientDate = firstClient[0]?.date;
		if (!firstClientDate) throw new createHttpError.BadRequest("Não foi possível encontrar o primeiro cliente cadastrado.");
		// Começa no início do dia local, para o primeiro intervalo não sair cortado no instante exato do
		// primeiro cliente.
		period.after = dayjs(firstClientDate).tz(OPERATION_TIMEZONE).startOf("day").toDate();
	}

	if (!period.before) {
		period.before = new Date();
	}

	// Granularidade decidida pelo período PRINCIPAL; a comparação usa a mesma, casada por posição.
	const granularity = getChartGranularity({ startDate: period.after, endDate: period.before });

	// Get main period data
	const mainData = await getGraphDataForPeriod({
		graphType: input.graphType,
		period: { after: period.after, before: period.before },
		buckets: getChartBuckets({ startDate: period.after, endDate: period.before, granularity }),
		userOrgId,
	});

	let comparisonData: Array<{ label: string; value: number }> | null = null;
	if (input.comparingPeriodAfter && input.comparingPeriodBefore) {
		comparisonData = await getGraphDataForPeriod({
			graphType: input.graphType,
			period: { after: input.comparingPeriodAfter, before: input.comparingPeriodBefore },
			buckets: getChartBuckets({ startDate: input.comparingPeriodAfter, endDate: input.comparingPeriodBefore, granularity }),
			userOrgId,
		});
	}

	// Merge by index
	const mergedData = mainData.map((item, index) => ({
		label: item.label,
		value: item.value,
		comparisonLabel: comparisonData?.[index]?.label,
		comparisonValue: comparisonData?.[index]?.value,
	}));

	return {
		data: mergedData,
	};
}

export type TGetClientsGraphOutput = Awaited<ReturnType<typeof getClientsGraph>>;

const getClientsGraphRoute: PagesRouteHandler<TGetClientsGraphOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetClientsGraphInputSchema.parse({
		graphType: req.query.graphType as "new-clients" | "clients-growth" | "active-clients",
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
		comparingPeriodAfter: (req.query.comparingPeriodAfter as string | undefined) ?? null,
		comparingPeriodBefore: (req.query.comparingPeriodBefore as string | undefined) ?? null,
	});

	const result = await getClientsGraph({ input, sessionUser });
	return res.status(200).json(result);
};

const routeHandlers = {
	GET: getClientsGraphRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});

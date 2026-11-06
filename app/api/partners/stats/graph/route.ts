import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, countDistinct, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetPartnersGraphInputSchema = z.object({
	graphType: z.enum(["sales-value", "sales-quantity", "active-partners", "average-ticket"], {
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
});

export type TGetPartnersGraphInput = z.infer<typeof GetPartnersGraphInputSchema>;

async function getPartnersGraph({ input, session }: { input: TGetPartnersGraphInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const sessionUser = session.user;

	const period = {
		after: input.periodAfter,
		before: input.periodBefore,
	};

	console.log(`[ORG: ${userOrgId}] [INFO] [GET PARTNERS GRAPH] Period:`, period);

	// If no start period, get the first sale date
	if (!period.after) {
		const firstSale = await db
			.select({
				date: sales.dataVenda,
			})
			.from(sales)
			.where(and(eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")))
			.orderBy(sql`${sales.dataVenda} asc`)
			.limit(1);
		period.after = firstSale[0]?.date ?? undefined;
		if (!period.after) throw new createHttpError.BadRequest("Não foi possível encontrar a primeira venda cadastrada.");
	}

	if (!period.before) {
		period.before = new Date();
	}

	const buckets = getChartBuckets({ startDate: period.after, endDate: period.before });
	if (buckets.length === 0) return { data: [] };
	const bucketPosition = chartBucketPositionSql(sales.dataVenda, buckets);
	const periodSalesWhere = and(
		eq(sales.organizacaoId, userOrgId),
		isNotNull(sales.dataVenda),
		gte(sales.dataVenda, period.after),
		lte(sales.dataVenda, period.before),
		eq(sales.statusVenda, "CONFIRMADA"),
	);

	// Graph Type: sales-value (total revenue over time)
	if (input.graphType === "sales-value") {
		const salesValue = await db
			.select({ position: bucketPosition, total: sql<number>`SUM(${sales.valorTotal})` })
			.from(sales)
			.where(periodSalesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(salesValue.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: sales-quantity (total sales count over time)
	if (input.graphType === "sales-quantity") {
		const salesQuantity = await db
			.select({ position: bucketPosition, total: sql<number>`COUNT(${sales.id})` })
			.from(sales)
			.where(periodSalesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(salesQuantity.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: active-partners (unique partners who sold per period)
	if (input.graphType === "active-partners") {
		// Distintos por intervalo, no banco: somar os distintos de cada dia contaria o mesmo parceiro
		// uma vez por dia em que vendeu nos pontos de semana e de mês.
		const activePartners = await db
			.select({ position: bucketPosition, total: countDistinct(sales.parceiroId) })
			.from(sales)
			.where(and(periodSalesWhere, isNotNull(sales.parceiroId)))
			.groupBy(bucketPosition);
		const byPosition = new Map(activePartners.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: average-ticket (average ticket value over time)
	if (input.graphType === "average-ticket") {
		const ticketData = await db
			.select({
				position: bucketPosition,
				totalRevenue: sql<number>`SUM(${sales.valorTotal})`,
				salesCount: sql<number>`COUNT(${sales.id})`,
			})
			.from(sales)
			.where(periodSalesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(ticketData.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => {
				const row = byPosition.get(index + 1);
				const revenue = Number(row?.totalRevenue ?? 0);
				const salesCount = Number(row?.salesCount ?? 0);
				return { label: bucket.label, value: salesCount > 0 ? revenue / salesCount : 0 };
			}),
		};
	}

	return {
		data: [],
	};
}

export type TGetPartnersGraphOutput = Awaited<ReturnType<typeof getPartnersGraph>>;

const getPartnersGraphRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const searchParams = await request.nextUrl.searchParams;
	const input = GetPartnersGraphInputSchema.parse({
		graphType: searchParams.get("graphType") as "sales-value" | "sales-quantity" | "active-partners" | "average-ticket" | null,
		periodAfter: searchParams.get("periodAfter") ?? null,
		periodBefore: searchParams.get("periodBefore") ?? null,
	});

	const result = await getPartnersGraph({ input, session: session });
	return NextResponse.json(result);
};

export const GET = appApiHandler({
	GET: getPartnersGraphRoute,
});

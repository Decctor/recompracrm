import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getChartBuckets } from "@/lib/charts/period-buckets";
import { chartBucketPositionSql } from "@/lib/charts/period-buckets-sql";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

dayjs.extend(utc);
dayjs.extend(timezone);

const GetProductsGraphInputSchema = z.object({
	graphType: z.enum(["sales-value", "sales-quantity", "active-products", "margin"], {
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

export type TGetProductsGraphInput = z.infer<typeof GetProductsGraphInputSchema>;

async function getProductsGraph({ input, sessionUser }: { input: TGetProductsGraphInput; sessionUser: TAuthUserSession }) {
	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const period = {
		after: input.periodAfter,
		before: input.periodBefore,
	};

	console.log(`[ORG: ${userOrgId}] [INFO] [GET PRODUCTS GRAPH] Period:`, period);

	// If no start period, get the first sale date
	if (!period.after) {
		const firstSale = await db
			.select({
				date: sales.dataVenda,
			})
			.from(sales)
			.where(eq(sales.organizacaoId, userOrgId))
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

	// Linhas atribuídas a produto: adicional vinculado conta para o produto da opção
	// (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });
	const periodLinesWhere = and(
		eq(lines.organizacaoId, userOrgId),
		eq(sales.organizacaoId, userOrgId),
		gte(sales.dataVenda, period.after),
		lte(sales.dataVenda, period.before),
		eq(sales.statusVenda, "CONFIRMADA"),
	);

	// Graph Type: sales-value (total revenue over time)
	if (input.graphType === "sales-value") {
		const salesValue = await db
			.select({ position: bucketPosition, total: sql<number>`SUM(${lines.valorVendaTotalLiquido})` })
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(periodLinesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(salesValue.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: sales-quantity (total units sold over time)
	if (input.graphType === "sales-quantity") {
		const salesQuantity = await db
			.select({ position: bucketPosition, total: sql<number>`SUM(${lines.quantidade})` })
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(periodLinesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(salesQuantity.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: active-products (unique products sold per period)
	if (input.graphType === "active-products") {
		const activeProducts = await db
			.select({ position: bucketPosition, total: countDistinct(lines.produtoId) })
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(periodLinesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(activeProducts.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => ({ label: bucket.label, value: Number(byPosition.get(index + 1)?.total ?? 0) })),
		};
	}

	// Graph Type: margin (profit margin evolution over time)
	if (input.graphType === "margin") {
		const marginData = await db
			.select({
				position: bucketPosition,
				revenue: sql<number>`SUM(${lines.valorVendaTotalLiquido})`,
				cost: sql<number>`SUM(${lines.valorCustoTotal})`,
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(periodLinesWhere)
			.groupBy(bucketPosition);
		const byPosition = new Map(marginData.map((row) => [Number(row.position), row]));

		return {
			data: buckets.map((bucket, index) => {
				const row = byPosition.get(index + 1);
				const revenue = Number(row?.revenue ?? 0);
				const marginValue = revenue - Number(row?.cost ?? 0);
				return { label: bucket.label, value: revenue > 0 ? (marginValue / revenue) * 100 : 0 };
			}),
		};
	}

	return {
		data: [],
	};
}

export type TGetProductsGraphOutput = Awaited<ReturnType<typeof getProductsGraph>>;

const getProductsGraphRoute: PagesRouteHandler<TGetProductsGraphOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetProductsGraphInputSchema.parse({
		graphType: req.query.graphType as "sales-value" | "sales-quantity" | "active-products" | "margin",
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
	});

	const result = await getProductsGraph({ input, sessionUser });
	return res.status(200).json(result);
};

const routeHandlers = {
	GET: getProductsGraphRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});

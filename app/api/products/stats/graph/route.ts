import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getBestNumberOfPointsBetweenDates, getDateBuckets, getEvenlySpacedDates } from "@/lib/dates";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, countDistinct, eq, gte, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

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
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Formato de data inválido." })
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
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

	const { points: bestNumberOfPointsForPeriodsDates, groupingFormat } = getBestNumberOfPointsBetweenDates({
		startDate: period.after,
		endDate: period.before,
	});

	const periodDatesStrs = getEvenlySpacedDates({
		startDate: period.after,
		endDate: period.before,
		points: bestNumberOfPointsForPeriodsDates,
	});

	const periodDateBuckets = getDateBuckets(periodDatesStrs);

	// Linhas atribuídas a produto: adicional vinculado conta para o produto da opção
	// (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });

	// Graph Type: sales-value (total revenue over time)
	if (input.graphType === "sales-value") {
		const salesValue = await db
			.select({
				date: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
				total: sql<number>`SUM(${lines.valorVendaTotalLiquido})`,
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(
				and(
					eq(lines.organizacaoId, userOrgId),
					eq(sales.organizacaoId, userOrgId),
					gte(sales.dataVenda, period.after),
					lte(sales.dataVenda, period.before),
					eq(sales.statusVenda, "CONFIRMADA"),
				),
			)
			.orderBy(sql`date_trunc('day', ${sales.dataVenda})`)
			.groupBy(sql`date_trunc('day', ${sales.dataVenda})`);

		const initialSalesValue = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const salesValueReduced = salesValue.reduce((acc, current) => {
			const saleDate = new Date(current.date);
			const saleTime = saleDate.getTime();

			const bucket = periodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total ?? 0);
			return acc;
		}, initialSalesValue);

		const salesValueGraph = Object.entries(salesValueReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));

		return {
			data: salesValueGraph,
		};
	}

	// Graph Type: sales-quantity (total units sold over time)
	if (input.graphType === "sales-quantity") {
		const salesQuantity = await db
			.select({
				date: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
				total: sql<number>`SUM(${lines.quantidade})`,
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(
				and(
					eq(lines.organizacaoId, userOrgId),
					eq(sales.organizacaoId, userOrgId),
					gte(sales.dataVenda, period.after),
					lte(sales.dataVenda, period.before),
					eq(sales.statusVenda, "CONFIRMADA"),
				),
			)
			.orderBy(sql`date_trunc('day', ${sales.dataVenda})`)
			.groupBy(sql`date_trunc('day', ${sales.dataVenda})`);

		const initialSalesQuantity = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const salesQuantityReduced = salesQuantity.reduce((acc, current) => {
			const saleDate = new Date(current.date);
			const saleTime = saleDate.getTime();

			const bucket = periodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total ?? 0);
			return acc;
		}, initialSalesQuantity);

		const salesQuantityGraph = Object.entries(salesQuantityReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));

		return {
			data: salesQuantityGraph,
		};
	}

	// Graph Type: active-products (unique products sold per period)
	if (input.graphType === "active-products") {
		const activeProducts = await db
			.select({
				date: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
				total: countDistinct(lines.produtoId),
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(
				and(
					eq(lines.organizacaoId, userOrgId),
					eq(sales.organizacaoId, userOrgId),
					gte(sales.dataVenda, period.after),
					lte(sales.dataVenda, period.before),
					eq(sales.statusVenda, "CONFIRMADA"),
				),
			)
			.orderBy(sql`date_trunc('day', ${sales.dataVenda})`)
			.groupBy(sql`date_trunc('day', ${sales.dataVenda})`);

		const initialActiveProducts = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { value: 0 }]));

		const activeProductsReduced = activeProducts.reduce((acc, current) => {
			const saleDate = new Date(current.date);
			const saleTime = saleDate.getTime();

			const bucket = periodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { value: 0 };

			acc[key].value += Number(current.total);
			return acc;
		}, initialActiveProducts);

		const activeProductsGraph = Object.entries(activeProductsReduced).map(([key, value]) => ({
			label: key,
			value: value.value,
		}));

		return {
			data: activeProductsGraph,
		};
	}

	// Graph Type: margin (profit margin evolution over time)
	if (input.graphType === "margin") {
		const marginData = await db
			.select({
				date: sql<string>`date_trunc('day', ${sales.dataVenda})::text`,
				revenue: sql<number>`SUM(${lines.valorVendaTotalLiquido})`,
				cost: sql<number>`SUM(${lines.valorCustoTotal})`,
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(
				and(
					eq(lines.organizacaoId, userOrgId),
					eq(sales.organizacaoId, userOrgId),
					gte(sales.dataVenda, period.after),
					lte(sales.dataVenda, period.before),
					eq(sales.statusVenda, "CONFIRMADA"),
				),
			)
			.orderBy(sql`date_trunc('day', ${sales.dataVenda})`)
			.groupBy(sql`date_trunc('day', ${sales.dataVenda})`);

		const initialMargin = Object.fromEntries(periodDatesStrs.map((date) => [dayjs(date).format(groupingFormat), { revenue: 0, cost: 0 }]));

		const marginReduced = marginData.reduce((acc, current) => {
			const saleDate = new Date(current.date);
			const saleTime = saleDate.getTime();

			const bucket = periodDateBuckets.find((b) => saleTime >= b.start && saleTime <= b.end);
			if (!bucket) return acc;

			const key = dayjs(bucket.key).format(groupingFormat);
			if (!acc[key]) acc[key] = { revenue: 0, cost: 0 };

			acc[key].revenue += Number(current.revenue ?? 0);
			acc[key].cost += Number(current.cost ?? 0);
			return acc;
		}, initialMargin);

		const marginGraph = Object.entries(marginReduced).map(([key, value]) => {
			const marginValue = value.revenue - value.cost;
			const marginPercentage = value.revenue > 0 ? (marginValue / value.revenue) * 100 : 0;
			return {
				label: key,
				value: marginPercentage,
			};
		});

		return {
			data: marginGraph,
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

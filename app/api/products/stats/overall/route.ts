import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { products, sales } from "@/services/drizzle/schema";
import { and, count, countDistinct, eq, gte, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetProductsOverallStatsInputSchema = z.object({
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingPeriodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingPeriodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});

export type TGetProductsOverallStatsInput = z.infer<typeof GetProductsOverallStatsInputSchema>;

async function getProductsOverallStats({ input, session }: { input: TGetProductsOverallStatsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	console.log("[INFO] [GET PRODUCTS STATS] Starting:", {
		userOrg: userOrgId,
		input,
	});

	const { periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore } = input;

	// 1. Total products count (all products in organization)
	const totalProductsResult = await db.select({ count: count() }).from(products).where(eq(products.organizacaoId, userOrgId));

	// Linhas atribuídas a produto: adicional vinculado conta para o produto da opção
	// (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });

	// 2. Active products (products sold in the period)
	const saleConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) saleConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) saleConditions.push(lte(sales.dataVenda, periodBefore));

	const activeProductsResult = await db
		.select({ count: countDistinct(lines.produtoId) })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...saleConditions));

	// 3. Total revenue (sum of valorVendaTotalLiquido)
	const revenueResult = await db
		.select({
			totalRevenue: sum(lines.valorVendaTotalLiquido),
			totalCost: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...saleConditions));

	const totalRevenue = Number(revenueResult[0]?.totalRevenue ?? 0);
	const totalCost = Number(revenueResult[0]?.totalCost ?? 0);
	const totalMargin = totalRevenue - totalCost;
	const averageMarginPercentage = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

	// 4. Stock Health Metrics
	const allProducts = await db
		.select({
			quantidade: products.quantidade,
			precoCusto: products.precoCusto,
			id: products.id,
		})
		.from(products)
		.where(eq(products.organizacaoId, userOrgId));

	let outOfStock = 0;
	let lowStock = 0;
	let healthyStock = 0;
	let overstocked = 0;
	let totalInventoryValue = 0;

	for (const product of allProducts) {
		const qty = product.quantidade ?? 0;
		if (qty === 0) {
			outOfStock++;
		} else if (qty <= 10) {
			lowStock++;
		} else if (qty <= 50) {
			healthyStock++;
		} else {
			overstocked++;
		}

		// Calculate inventory value
		if (product.quantidade && product.precoCusto) {
			totalInventoryValue += product.quantidade * product.precoCusto;
		}
	}

	// 5. Average Turnover Rate (days to sell current inventory)
	// Get total quantity sold and calculate average daily sales
	const daysInPeriod =
		periodAfter && periodBefore ? Math.max(1, Math.ceil((periodBefore.getTime() - periodAfter.getTime()) / (1000 * 60 * 60 * 24))) : 30;

	const turnoverData = await db
		.select({
			productId: lines.produtoId,
			totalQtySold: sum(lines.quantidade),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...saleConditions))
		.groupBy(lines.produtoId);

	const turnoverMap = new Map(turnoverData.map((d) => [d.productId, Number(d.totalQtySold ?? 0)]));

	let totalTurnoverDays = 0;
	let productsWithTurnover = 0;
	let atRiskCount = 0;

	for (const product of allProducts) {
		const qtySold = turnoverMap.get(product.id) ?? 0;
		const currentStock = product.quantidade ?? 0;

		if (qtySold > 0 && currentStock > 0) {
			const avgDailySales = qtySold / daysInPeriod;
			const daysOfStock = currentStock / avgDailySales;
			totalTurnoverDays += daysOfStock;
			productsWithTurnover++;
		}

		// At-risk inventory: high stock (>20) with very low sales (< 1 per day)
		if (currentStock > 20 && qtySold / daysInPeriod < 1) {
			atRiskCount++;
		}
	}

	const averageTurnoverDays = productsWithTurnover > 0 ? totalTurnoverDays / productsWithTurnover : 0;

	// If no comparison period, return current stats only
	if (!comparingPeriodAfter && !comparingPeriodBefore) {
		return {
			data: {
				totalProducts: {
					current: totalProductsResult[0]?.count ?? 0,
					comparison: null,
				},
				activeProducts: {
					current: Number(activeProductsResult[0]?.count ?? 0),
					comparison: null,
				},
				totalRevenue: {
					current: totalRevenue,
					comparison: null,
				},
				averageMargin: {
					current: averageMarginPercentage,
					comparison: null,
				},
				stockHealth: {
					current: {
						outOfStock,
						lowStock,
						healthyStock,
						overstocked,
					},
					comparison: null,
				},
				averageTurnoverDays: {
					current: averageTurnoverDays,
					comparison: null,
				},
				totalInventoryValue: {
					current: totalInventoryValue,
					comparison: null,
				},
				atRiskInventory: {
					current: atRiskCount,
					comparison: null,
				},
			},
		};
	}

	// Calculate comparison period stats
	const comparisonSaleConditions = [eq(sales.organizacaoId, userOrgId)];
	if (comparingPeriodAfter) comparisonSaleConditions.push(gte(sales.dataVenda, comparingPeriodAfter));
	if (comparingPeriodBefore) comparisonSaleConditions.push(lte(sales.dataVenda, comparingPeriodBefore));

	const comparisonTotalProductsResult = await db.select({ count: count() }).from(products).where(eq(products.organizacaoId, userOrgId));

	const comparisonActiveProductsResult = await db
		.select({ count: countDistinct(lines.produtoId) })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...comparisonSaleConditions));

	const comparisonRevenueResult = await db
		.select({
			totalRevenue: sum(lines.valorVendaTotalLiquido),
			totalCost: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...comparisonSaleConditions));

	const comparisonTotalRevenue = Number(comparisonRevenueResult[0]?.totalRevenue ?? 0);
	const comparisonTotalCost = Number(comparisonRevenueResult[0]?.totalCost ?? 0);
	const comparisonTotalMargin = comparisonTotalRevenue - comparisonTotalCost;
	const comparisonAverageMarginPercentage = comparisonTotalRevenue > 0 ? (comparisonTotalMargin / comparisonTotalRevenue) * 100 : 0;

	// Comparison period inventory metrics
	const comparisonDaysInPeriod =
		comparingPeriodAfter && comparingPeriodBefore
			? Math.max(1, Math.ceil((comparingPeriodBefore.getTime() - comparingPeriodAfter.getTime()) / (1000 * 60 * 60 * 24)))
			: 30;

	const comparisonTurnoverData = await db
		.select({
			productId: lines.produtoId,
			totalQtySold: sum(lines.quantidade),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), ...comparisonSaleConditions))
		.groupBy(lines.produtoId);

	const comparisonTurnoverMap = new Map(comparisonTurnoverData.map((d) => [d.productId, Number(d.totalQtySold ?? 0)]));

	let comparisonTotalTurnoverDays = 0;
	let comparisonProductsWithTurnover = 0;
	let comparisonAtRiskCount = 0;

	for (const product of allProducts) {
		const qtySold = comparisonTurnoverMap.get(product.id) ?? 0;
		const currentStock = product.quantidade ?? 0;

		if (qtySold > 0 && currentStock > 0) {
			const avgDailySales = qtySold / comparisonDaysInPeriod;
			const daysOfStock = currentStock / avgDailySales;
			comparisonTotalTurnoverDays += daysOfStock;
			comparisonProductsWithTurnover++;
		}

		if (currentStock > 20 && qtySold / comparisonDaysInPeriod < 1) {
			comparisonAtRiskCount++;
		}
	}

	const comparisonAverageTurnoverDays = comparisonProductsWithTurnover > 0 ? comparisonTotalTurnoverDays / comparisonProductsWithTurnover : 0;

	return {
		data: {
			totalProducts: {
				current: totalProductsResult[0]?.count ?? 0,
				comparison: comparisonTotalProductsResult[0]?.count ?? 0,
			},
			activeProducts: {
				current: Number(activeProductsResult[0]?.count ?? 0),
				comparison: Number(comparisonActiveProductsResult[0]?.count ?? 0),
			},
			totalRevenue: {
				current: totalRevenue,
				comparison: comparisonTotalRevenue,
			},
			averageMargin: {
				current: averageMarginPercentage,
				comparison: comparisonAverageMarginPercentage,
			},
			stockHealth: {
				current: {
					outOfStock,
					lowStock,
					healthyStock,
					overstocked,
				},
				comparison: {
					outOfStock,
					lowStock,
					healthyStock,
					overstocked,
				},
			},
			averageTurnoverDays: {
				current: averageTurnoverDays,
				comparison: comparisonAverageTurnoverDays,
			},
			totalInventoryValue: {
				current: totalInventoryValue,
				comparison: totalInventoryValue,
			},
			atRiskInventory: {
				current: atRiskCount,
				comparison: comparisonAtRiskCount,
			},
		},
	};
}

export type TGetProductsOverallStatsOutput = Awaited<ReturnType<typeof getProductsOverallStats>>;

const getProductsOverallStatsRoute: PagesRouteHandler<TGetProductsOverallStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetProductsOverallStatsInputSchema.parse(req.query);
	const data = await getProductsOverallStats({ input, session: sessionUser });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getProductsOverallStatsRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});

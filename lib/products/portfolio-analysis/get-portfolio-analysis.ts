import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { db } from "@/services/drizzle";
import { products, sales } from "@/services/drizzle/schema";
import {
	buildDiscreteHistogram,
	buildHistogram,
	buildLogHistogram,
	countProductsForRevenueShare,
	giniCoefficient,
	summarizeMetric,
} from "@/utils/analytics";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { assignAbcClasses, buildAbcDistribution } from "./build-abc-distribution";
import { buildPortfolioAnalysisFindings } from "./build-findings";
import { buildPortfolioAnalysisSummary } from "./build-analysis-summary";
import type { TGetPortfolioAnalysisResult, TProductWithPeriodMetrics, TTopRevenueConcentrationItem } from "./types";

export type TGetPortfolioAnalysisInput = {
	periodAfter: Date | null;
	periodBefore: Date | null;
};

const TOP_REVENUE_LIMITS = [10, 50, 100] as const;

function buildTopRevenueConcentration(activeProducts: TProductWithPeriodMetrics[]): TTopRevenueConcentrationItem[] {
	const totalRevenue = activeProducts.reduce((acc, product) => acc + product.revenue, 0);

	return TOP_REVENUE_LIMITS.map((limit) => {
		const topProducts = activeProducts.slice(0, limit);
		const revenue = topProducts.reduce((acc, product) => acc + product.revenue, 0);

		return {
			limit,
			productsCount: topProducts.length,
			revenue,
			revenueShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
		};
	});
}

export async function getPortfolioAnalysis({
	input,
	organizationId,
}: {
	input: TGetPortfolioAnalysisInput;
	organizationId: string;
}): Promise<TGetPortfolioAnalysisResult> {
	const { periodAfter, periodBefore } = input;

	const saleConditions = [eq(sales.organizacaoId, organizationId), eq(sales.statusVenda, "CONFIRMADA")];
	if (periodAfter) saleConditions.push(gte(sales.dataVenda, periodAfter));
	if (periodBefore) saleConditions.push(lte(sales.dataVenda, periodBefore));

	// Linhas atribuídas a produto: adicional vinculado conta para o produto da opção.
	const lines = getProductSalesLines({ organizationId });
	const [totalProductsResult, salesByProduct] = await Promise.all([
		db.select({ count: count() }).from(products).where(eq(products.organizacaoId, organizationId)),
		db
			.select({
				productId: lines.produtoId,
				revenue: sql<number>`coalesce(sum(${lines.valorVendaTotalLiquido}), 0)`,
				cost: sql<number>`coalesce(sum(${lines.valorCustoTotal}), 0)`,
				quantity: sql<number>`coalesce(sum(${lines.quantidade}), 0)`,
				saleCount: sql<number>`count(distinct ${lines.vendaId})`,
			})
			.from(lines)
			.innerJoin(sales, eq(lines.vendaId, sales.id))
			.where(and(eq(lines.organizacaoId, organizationId), ...saleConditions))
			.groupBy(lines.produtoId),
	]);

	const totalProducts = totalProductsResult[0]?.count ?? 0;
	const rawActiveProducts = salesByProduct.map((row) => ({
		productId: row.productId,
		revenue: Number(row.revenue ?? 0),
		cost: Number(row.cost ?? 0),
		quantity: Number(row.quantity ?? 0),
		saleCount: Number(row.saleCount ?? 0),
	}));

	const activeProducts = assignAbcClasses(rawActiveProducts);
	const activeCount = activeProducts.length;
	const dormantProducts = Math.max(0, totalProducts - activeCount);

	const abcDistribution = buildAbcDistribution(activeProducts);
	const revenueValues = activeProducts.map((product) => product.revenue);
	const marginValues = activeProducts.filter((product) => product.revenue > 0).map((product) => product.marginPercentage);
	const saleFrequencyValues = activeProducts.map((product) => product.saleCount);

	const revenueMetrics = summarizeMetric(revenueValues);
	const marginMetrics = summarizeMetric(marginValues);
	const saleFrequencyMetrics = summarizeMetric(saleFrequencyValues);

	const findings = buildPortfolioAnalysisFindings({
		totalProducts,
		activeProducts,
		abcDistribution,
		revenueMetrics,
		marginMetrics,
	});

	const analysisSummary = buildPortfolioAnalysisSummary(findings, totalProducts, activeCount);

	return {
		period: {
			start: periodAfter,
			end: periodBefore,
		},
		totalProducts,
		activeProducts: activeCount,
		dormantProducts,
		analysisSummary,
		findings,
		abcDistribution,
		vitality: {
			active: {
				count: activeCount,
				percentage: totalProducts > 0 ? (activeCount / totalProducts) * 100 : 0,
			},
			dormant: {
				count: dormantProducts,
				percentage: totalProducts > 0 ? (dormantProducts / totalProducts) * 100 : 0,
			},
		},
		concentration: {
			productsFor80PctRevenue: countProductsForRevenueShare(revenueValues, 0.8),
			gini: giniCoefficient(revenueValues),
		},
		topRevenueConcentration: buildTopRevenueConcentration(activeProducts),
		metrics: {
			revenue: revenueMetrics,
			margin: marginMetrics,
			saleFrequency: saleFrequencyMetrics,
		},
		histograms: {
			revenue: buildLogHistogram(revenueValues, { clipToPercentile: 95 }),
			margin: buildHistogram(marginValues, 15),
			saleFrequency: buildDiscreteHistogram(saleFrequencyValues, [
				{ label: "1", min: 1, max: 1 },
				{ label: "2", min: 2, max: 2 },
				{ label: "3", min: 3, max: 3 },
				{ label: "4", min: 4, max: 4 },
				{ label: "5", min: 5, max: 5 },
				{ label: "6-10", min: 6, max: 10 },
				{ label: "11-20", min: 11, max: 20 },
				{ label: "20+", min: 21, max: Number.MAX_SAFE_INTEGER },
			]),
		},
	};
}

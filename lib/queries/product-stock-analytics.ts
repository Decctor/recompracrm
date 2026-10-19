import type { TGetProductPriceCostHistoryOutput } from "@/app/api/products/price-cost-history/route";
import type { TGetProductStockAnalyticsOutput } from "@/app/api/products/stock-analytics/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export type TProductStockAnalyticsPeriod = 7 | 30 | 90;

async function fetchProductStockAnalytics({ productId, period }: { productId: string; period: TProductStockAnalyticsPeriod }) {
	const searchParams = new URLSearchParams({ productId, period: String(period) });
	const { data } = await axios.get<TGetProductStockAnalyticsOutput>(`/api/products/stock-analytics?${searchParams.toString()}`);
	return data.data.analytics;
}

export function useProductStockAnalytics({
	productId,
	period,
	enabled = true,
}: {
	productId: string;
	period: TProductStockAnalyticsPeriod;
	enabled?: boolean;
}) {
	const queryKey = ["product-stock-analytics", productId, period];
	return {
		...useQuery({ queryKey, queryFn: () => fetchProductStockAnalytics({ productId, period }), enabled }),
		queryKey,
	};
}

async function fetchProductPriceCostHistory({ productId }: { productId: string }) {
	const searchParams = new URLSearchParams({ productId });
	const { data } = await axios.get<TGetProductPriceCostHistoryOutput>(`/api/products/price-cost-history?${searchParams.toString()}`);
	return data.data;
}

export function useProductPriceCostHistory({ productId, enabled = true }: { productId: string; enabled?: boolean }) {
	const queryKey = ["product-price-cost-history", productId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchProductPriceCostHistory({ productId }), enabled }),
		queryKey,
	};
}

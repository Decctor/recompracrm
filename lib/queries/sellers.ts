import type { TGetSellersByIdInput, TGetSellersDefaultInput, TGetSellersInput, TGetSellersOutput } from "@/app/api/sellers/route";
import type { TGetPoiSellersOutput } from "@/app/api/point-of-interaction/sellers/route";
import type { TGetSellerStatsInput, TGetSellerStatsOutput } from "@/app/api/sellers/stats/route";
import type { TGetSellersGraphInput, TGetSellersGraphOutput } from "@/app/api/sellers/stats/graph/route";
import type { TGetSellersOverallStatsInput, TGetSellersOverallStatsOutput } from "@/app/api/sellers/stats/overall/route";
import type { TGetSellersRankingInput, TGetSellersRankingOutput } from "@/app/api/sellers/stats/ranking/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchSellers(input: TGetSellersDefaultInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.sellersIds) searchParams.set("sellersIds", input.sellersIds.join(","));
		if (input.statsIntegrationsIds) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
		if (input.statsExcludedSalesIds) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
		if (input.statsTotalMin) searchParams.set("statsTotalMin", input.statsTotalMin.toString());
		if (input.statsTotalMax) searchParams.set("statsTotalMax", input.statsTotalMax.toString());
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
		if (input.activeOnly) searchParams.set("activeOnly", input.activeOnly.toString());
		const { data } = await axios.get<TGetSellersOutput>(`/api/sellers?${searchParams.toString()}`);
		const result = data.data.default;
		if (!result) throw new Error("Vendedores não encontrados.");
		return result;
	} catch (error) {
		console.log("Error running fetchSellers", error);
		throw error;
	}
}

async function fetchSellersById(input: TGetSellersByIdInput) {
	try {
		const { data } = await axios.get<TGetSellersOutput>(`/api/sellers?id=${input.id}`);
		const result = data.data.byId;
		if (!result) throw new Error("Vendedor não encontrado.");
		return result;
	} catch (error) {
		console.log("Error running fetchSellersById", error);
		throw error;
	}
}

export function useSellerById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["seller-by-id", id],
			queryFn: () => fetchSellersById({ id }),
		}),
		queryKey: ["seller-by-id", id],
	};
}

type UseSellersParams = {
	initialFilters?: Partial<TGetSellersDefaultInput>;
};
export function useSellers({ initialFilters }: UseSellersParams) {
	const [filters, setFilters] = useState<TGetSellersDefaultInput>({
		page: initialFilters?.page || 1,
		pageSize: initialFilters?.pageSize || DEFAULT_PAGE_SIZE,
		sellersIds: initialFilters?.sellersIds || [],
		statsIntegrationsIds: initialFilters?.statsIntegrationsIds || [],
		statsExcludedSalesIds: initialFilters?.statsExcludedSalesIds || [],
		statsTotalMin: initialFilters?.statsTotalMin || null,
		statsTotalMax: initialFilters?.statsTotalMax || null,
		search: initialFilters?.search || "",
		statsPeriodAfter: initialFilters?.statsPeriodAfter || null,
		statsPeriodBefore: initialFilters?.statsPeriodBefore || null,
		orderByField: initialFilters?.orderByField || "nome",
		orderByDirection: initialFilters?.orderByDirection || "asc",
		activeOnly: initialFilters?.activeOnly ?? true,
		simplified: false,
	});
	function updateFilters(newParams: Partial<TGetSellersDefaultInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newParams }));
	}

	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["sellers", debouncedFilters],
			queryFn: () => fetchSellers(debouncedFilters),
		}),
		queryKey: ["sellers", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchSellersSimplified() {
	const { data } = await axios.get<TGetSellersOutput>("/api/sellers?simplified=true");
	const result = data.data.simplified;
	if (!result) throw new Error("Vendedores não encontrados.");
	return result;
}

export function useSellersSimplified() {
	return {
		...useQuery({
			queryKey: ["sellers-simplified"],
			queryFn: () => fetchSellersSimplified(),
		}),
		queryKey: ["sellers-simplified"],
	};
}

// Lista mínima (id, nome, avatarUrl) para o select "QUEM TE ATENDEU" do autocadastro POI.
// Rota pública em modo legado — o orgId vai na query string, sem sessão.
async function fetchPoiSellers(orgId: string) {
	const { data } = await axios.get<TGetPoiSellersOutput>(`/api/point-of-interaction/sellers?orgId=${orgId}`);
	return data.data.sellers;
}

export function usePoiSellers({ orgId }: { orgId: string }) {
	return {
		...useQuery({
			queryKey: ["poi-sellers", orgId],
			queryFn: () => fetchPoiSellers(orgId),
			staleTime: 5 * 60 * 1000,
		}),
		queryKey: ["poi-sellers", orgId],
	};
}

async function fetchSellerStats(input: TGetSellerStatsInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("sellerId", input.sellerId);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter);
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore);
		const { data } = await axios.get<TGetSellerStatsOutput>(`/api/sellers/stats?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchSellerStats", error);
		throw error;
	}
}

type UseSellerStatsParams = {
	sellerId: string;
	initialFilters?: Partial<Omit<TGetSellerStatsInput, "sellerId">>;
};
export function useSellerStats({ sellerId, initialFilters }: UseSellerStatsParams) {
	const [filters, setFilters] = useState<Omit<TGetSellerStatsInput, "sellerId">>({
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
	});
	function updateFilters(newFilters: Partial<Omit<TGetSellerStatsInput, "sellerId">>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 1000);
	return {
		...useQuery({
			queryKey: ["seller-stats", sellerId, debouncedFilters],
			queryFn: () => fetchSellerStats({ sellerId, ...debouncedFilters }),
		}),
		queryKey: ["seller-stats", sellerId, debouncedFilters],
		filters,
		updateFilters,
	};
}

// Sellers Overall Stats Query
async function fetchSellersOverallStats(input: TGetSellersOverallStatsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		const { data } = await axios.get<TGetSellersOverallStatsOutput>(`/api/sellers/stats/overall?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchSellersOverallStats", error);
		throw error;
	}
}

export function useSellersOverallStats(input: TGetSellersOverallStatsInput) {
	return useQuery({
		queryKey: ["sellers-overall-stats", input],
		queryFn: () => fetchSellersOverallStats(input),
	});
}

// Sellers Graph Query
async function fetchSellersGraph(input: TGetSellersGraphInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("graphType", input.graphType);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		const { data } = await axios.get<TGetSellersGraphOutput>(`/api/sellers/stats/graph?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchSellersGraph", error);
		throw error;
	}
}

export function useSellersGraph(input: TGetSellersGraphInput) {
	return useQuery({
		queryKey: ["sellers-graph", input],
		queryFn: () => fetchSellersGraph(input),
	});
}

// Sellers Ranking Query
async function fetchSellersRanking(input: TGetSellersRankingInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		if (input.rankingBy) searchParams.set("rankingBy", input.rankingBy);
		const { data } = await axios.get<TGetSellersRankingOutput>(`/api/sellers/stats/ranking?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchSellersRanking", error);
		throw error;
	}
}

export function useSellersRanking(input: TGetSellersRankingInput) {
	return useQuery({
		queryKey: ["sellers-ranking", input],
		queryFn: () => fetchSellersRanking(input),
	});
}

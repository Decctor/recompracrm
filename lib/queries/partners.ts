import type { TGetPartnersInput, TGetPartnersOutput } from "@/app/api/partners/route";
import type { TGetPartnersGraphInput, TGetPartnersGraphOutput } from "@/app/api/partners/stats/graph/route";
import type { TGetPartnersOverallStatsInput, TGetPartnersOverallStatsOutput } from "@/app/api/partners/stats/overall/route";
import type { TGetPartnersRankingInput, TGetPartnersRankingOutput } from "@/app/api/partners/stats/ranking/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchPartners(input: TGetPartnersInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
	if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
	if (input.statsIntegrationsIds && input.statsIntegrationsIds.length > 0)
		searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0)
		searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
	if (input.statsTotalMin) searchParams.set("statsTotalMin", input.statsTotalMin.toString());
	if (input.statsTotalMax) searchParams.set("statsTotalMax", input.statsTotalMax.toString());
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	const { data } = await axios.get<TGetPartnersOutput>(`/api/partners?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Parceiros não encontrados.");
	return result;
}

type UsePartnersParams = {
	initialParams: Partial<TGetPartnersInput>;
};
export function usePartners({ initialParams }: UsePartnersParams) {
	const [queryParams, setQueryParams] = useState<TGetPartnersInput>({
		page: initialParams.page || 1,
		pageSize: initialParams.pageSize || DEFAULT_PAGE_SIZE,
		search: initialParams.search || "",
		statsPeriodAfter: initialParams.statsPeriodAfter || null,
		statsPeriodBefore: initialParams.statsPeriodBefore || null,
		statsIntegrationsIds: initialParams.statsIntegrationsIds || [],
		statsExcludedSalesIds: initialParams.statsExcludedSalesIds || [],
		statsTotalMin: initialParams.statsTotalMin || null,
		statsTotalMax: initialParams.statsTotalMax || null,
	});

	function updateQueryParams(newParams: Partial<TGetPartnersInput>) {
		setQueryParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedQueryParams = useDebounceMemo(queryParams, 500);
	return {
		...useQuery({
			queryKey: ["partners", debouncedQueryParams],
			queryFn: () => fetchPartners(debouncedQueryParams),
		}),
		queryKey: ["partners", debouncedQueryParams],
		queryParams,
		updateQueryParams,
	};
}

async function fetchPartnerById({ id }: { id: string }) {
	const { data } = await axios.get<TGetPartnersOutput>(`/api/partners?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Parceiro não encontrado.");
	return result;
}

export function usePartnerById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["partner-by-id", id],
			queryFn: () => fetchPartnerById({ id }),
		}),
		queryKey: ["partner-by-id", id],
	};
}

// Partners Overall Stats Query
async function fetchPartnersOverallStats(input: TGetPartnersOverallStatsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		const { data } = await axios.get<TGetPartnersOverallStatsOutput>(`/api/partners/stats/overall?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPartnersOverallStats", error);
		throw error;
	}
}

export function usePartnersOverallStats(input: TGetPartnersOverallStatsInput) {
	return useQuery({
		queryKey: ["partners-overall-stats", input],
		queryFn: () => fetchPartnersOverallStats(input),
	});
}

// Partners Graph Query
async function fetchPartnersGraph(input: TGetPartnersGraphInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("graphType", input.graphType);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		const { data } = await axios.get<TGetPartnersGraphOutput>(`/api/partners/stats/graph?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPartnersGraph", error);
		throw error;
	}
}

export function usePartnersGraph(input: TGetPartnersGraphInput) {
	return useQuery({
		queryKey: ["partners-graph", input],
		queryFn: () => fetchPartnersGraph(input),
	});
}

// Partners Ranking Query
async function fetchPartnersRanking(input: TGetPartnersRankingInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		if (input.rankingBy) searchParams.set("rankingBy", input.rankingBy);
		const { data } = await axios.get<TGetPartnersRankingOutput>(`/api/partners/stats/ranking?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPartnersRanking", error);
		throw error;
	}
}

export function usePartnersRanking(input: TGetPartnersRankingInput) {
	return useQuery({
		queryKey: ["partners-ranking", input],
		queryFn: () => fetchPartnersRanking(input),
	});
}

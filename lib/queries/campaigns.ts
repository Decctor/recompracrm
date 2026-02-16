import type { TGetCampaignAnalyticsInput, TGetCampaignAnalyticsOutput } from "@/app/api/campaigns/analytics/route";
import type {
	TGetCampaignInteractionsInput,
	TGetCampaignInteractionsOutput,
} from "@/app/api/campaigns/interactions/route";
import type { TGetCampaignsInput, TGetCampaignsOutput } from "@/app/api/campaigns/route";
import type { TGetStatsBySegmentationInput, TGetStatsBySegmentationOutput } from "@/app/api/campaigns/stats/by-segmentation/route";
import type { TGetConversionQualityInput, TGetConversionQualityOutput } from "@/app/api/campaigns/stats/conversion-quality/route";
import type { TGetCampaignFunnelInput, TGetCampaignFunnelOutput } from "@/app/api/campaigns/stats/funnel/route";
import type { TGetCampaignGraphInput, TGetCampaignGraphOutput } from "@/app/api/campaigns/stats/graph/route";
import type { TGetCampaignRankingInput, TGetCampaignRankingOutput } from "@/app/api/campaigns/stats/ranking/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchCampaigns(input: Omit<TGetCampaignsInput, "id">) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.activeOnly) searchParams.set("activeOnly", input.activeOnly.toString());
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		const { data } = await axios.get<TGetCampaignsOutput>(`/api/campaigns?${searchParams.toString()}`);
		if (!data.data.default) throw new Error("Campanhas não encontradas.");
		return data.data.default;
	} catch (error) {
		console.log("Error running fetchCampaigns", error);
		throw error;
	}
}

type UseCampaignsParams = {
	initialFilters: Omit<TGetCampaignsInput, "id">;
};
export function useCampaigns({ initialFilters }: UseCampaignsParams) {
	const [filters, setFilters] = useState<Omit<TGetCampaignsInput, "id">>(initialFilters);
	function updateFilters(newFilters: Partial<Omit<TGetCampaignsInput, "id">>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["campaigns", debouncedFilters],
			queryFn: async () => await fetchCampaigns(debouncedFilters),
		}),
		queryKey: ["campaigns", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchCampaignById(id: string) {
	try {
		const { data } = await axios.get<TGetCampaignsOutput>(`/api/campaigns?id=${id}`);
		if (!data.data.byId) throw new Error("Campanha não encontrada.");
		return data.data.byId;
	} catch (error) {
		console.log("Error running fetchCampaignById", error);
		throw error;
	}
}

type UseCampaignByIdParams = {
	id: string;
};
export function useCampaignById({ id }: UseCampaignByIdParams) {
	return {
		...useQuery({
			queryKey: ["campaign-by-id", id],
			queryFn: async () => await fetchCampaignById(id),
		}),
		queryKey: ["campaign-by-id", id],
	};
}

async function fetchCampaignInteractionsLogs(input: TGetCampaignInteractionsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.status && input.status.length > 0) searchParams.set("status", input.status.join(","));
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		const { data } = await axios.get<TGetCampaignInteractionsOutput>(`/api/campaigns/interactions?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignInteractionsLogs", error);
		throw error;
	}
}

type UseCampaignInteractionsLogsParams = {
	initialFilters: TGetCampaignInteractionsInput;
};
export function useCampaignInteractionsLogs({ initialFilters }: UseCampaignInteractionsLogsParams) {
	const [filters, setFilters] = useState<TGetCampaignInteractionsInput>(initialFilters);
	function updateFilters(newFilters: Partial<TGetCampaignInteractionsInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["campaign-interactions-logs", debouncedFilters],
			queryFn: async () => await fetchCampaignInteractionsLogs(debouncedFilters),
		}),
		queryKey: ["campaign-interactions-logs", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchCampaignAnalytics(input: { startDate?: Date; endDate?: Date }) {
	try {
		const searchParams = new URLSearchParams();
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		const { data } = await axios.get<TGetCampaignAnalyticsOutput>(`/api/campaigns/analytics?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignAnalytics", error);
		throw error;
	}
}

export function useCampaignAnalytics(input: { startDate?: Date; endDate?: Date }) {
	return useQuery({
		queryKey: ["campaign-analytics", input],
		queryFn: async () => await fetchCampaignAnalytics(input),
	});
}

async function fetchCampaignGraph(input: TGetCampaignGraphInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("graphType", input.graphType);
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		if (input.comparingStartDate) searchParams.set("comparingStartDate", input.comparingStartDate.toISOString());
		if (input.comparingEndDate) searchParams.set("comparingEndDate", input.comparingEndDate.toISOString());
		const { data } = await axios.get<TGetCampaignGraphOutput>(`/api/campaigns/stats/graph?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignGraph", error);
		throw error;
	}
}

export function useCampaignGraph(input: TGetCampaignGraphInput) {
	return useQuery({
		queryKey: ["campaign-graph", input],
		queryFn: async () => await fetchCampaignGraph(input),
	});
}

async function fetchCampaignRanking(input: TGetCampaignRankingInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.rankingBy) searchParams.set("rankingBy", input.rankingBy);
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		if (input.comparingStartDate) searchParams.set("comparingStartDate", input.comparingStartDate.toISOString());
		if (input.comparingEndDate) searchParams.set("comparingEndDate", input.comparingEndDate.toISOString());
		const { data } = await axios.get<TGetCampaignRankingOutput>(`/api/campaigns/stats/ranking?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignRanking", error);
		throw error;
	}
}

export function useCampaignRanking(input: TGetCampaignRankingInput) {
	return useQuery({
		queryKey: ["campaign-ranking", input],
		queryFn: async () => await fetchCampaignRanking(input),
	});
}

async function fetchCampaignFunnel(input: TGetCampaignFunnelInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		const { data } = await axios.get<TGetCampaignFunnelOutput>(`/api/campaigns/stats/funnel?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignFunnel", error);
		throw error;
	}
}

export function useCampaignFunnel(input: TGetCampaignFunnelInput) {
	return useQuery({
		queryKey: ["campaign-funnel", input],
		queryFn: async () => await fetchCampaignFunnel(input),
	});
}

async function fetchStatsBySegmentation(input: TGetStatsBySegmentationInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		const { data } = await axios.get<TGetStatsBySegmentationOutput>(`/api/campaigns/stats/by-segmentation?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchStatsBySegmentation", error);
		throw error;
	}
}

export function useStatsBySegmentation(input: TGetStatsBySegmentationInput) {
	return useQuery({
		queryKey: ["campaign-stats-by-segmentation", input],
		queryFn: async () => await fetchStatsBySegmentation(input),
	});
}

async function fetchConversionQuality(input: TGetConversionQualityInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.startDate) searchParams.set("startDate", input.startDate.toISOString());
		if (input.endDate) searchParams.set("endDate", input.endDate.toISOString());
		if (input.campanhaId) searchParams.set("campanhaId", input.campanhaId);
		const { data } = await axios.get<TGetConversionQualityOutput>(`/api/campaigns/stats/conversion-quality?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchConversionQuality", error);
		throw error;
	}
}

export function useConversionQuality(input: TGetConversionQualityInput) {
	return useQuery({
		queryKey: ["campaign-conversion-quality", input],
		queryFn: async () => await fetchConversionQuality(input),
	});
}

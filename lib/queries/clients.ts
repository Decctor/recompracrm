import type { TGetClientsInput, TGetClientsOutput } from "@/pages/api/clients";
import type { TClientByLookupInput, TClientByLookupOutput } from "@/pages/api/clients/lookup";
import type { TGetClientsBySearchOutput } from "@/pages/api/clients/search";
import type { TGetClientStatsInput, TGetClientStatsOutput } from "@/pages/api/clients/stats/by-client";
import type { TGetClientsGraphInput, TGetClientsGraphOutput } from "@/pages/api/clients/stats/graph";
import type { TGetClientsOverallStatsInput, TGetClientsOverallStatsOutput } from "@/pages/api/clients/stats/overall";
import type { TGetClientsRankingInput, TGetClientsRankingOutput } from "@/pages/api/clients/stats/ranking";
import type { TClientDTO, TClientSearchQueryParams } from "@/schemas/clients";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { formatWithoutDiacritics } from "../formatting";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchClients(input: TGetClientsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.acquisitionChannels.length > 0) searchParams.set("acquisitionChannels", input.acquisitionChannels.join(","));
		if (input.segmentationTitles.length > 0) searchParams.set("segmentationTitles", input.segmentationTitles.join(","));
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.statsSaleNatures.length > 0) searchParams.set("statsSaleNatures", input.statsSaleNatures.join(","));
		if (input.statsExcludedSalesIds.length > 0) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		if (input.page) searchParams.set("page", input.page.toString());
		const { data } = await axios.get<TGetClientsOutput>(`/api/clients?${searchParams.toString()}`);

		if (!data.data.default) throw new Error("Clientes não encontrados.");
		return data.data.default;
	} catch (error) {
		console.log("Error running fetchClients", error);
		throw error;
	}
}

type UseClientsParams = {
	initialFilters: Partial<TGetClientsInput>;
};
export function useClients({ initialFilters }: UseClientsParams) {
	const [filters, setFilters] = useState<TGetClientsInput>({
		search: initialFilters?.search || "",
		acquisitionChannels: initialFilters?.acquisitionChannels || [],
		segmentationTitles: initialFilters?.segmentationTitles || [],
		statsPeriodAfter: initialFilters?.statsPeriodAfter || null,
		statsPeriodBefore: initialFilters?.statsPeriodBefore || null,
		statsSaleNatures: initialFilters?.statsSaleNatures || [],
		statsExcludedSalesIds: initialFilters?.statsExcludedSalesIds || [],
		orderByField: initialFilters?.orderByField || "nome",
		orderByDirection: initialFilters?.orderByDirection || "asc",
		page: initialFilters?.page || 1,
	});
	function updateFilters(newFilters: Partial<TGetClientsInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 1000);
	return {
		...useQuery({
			queryKey: ["clients", debouncedFilters],
			queryFn: async () => await fetchClients(debouncedFilters),
		}),
		queryKey: ["clients", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchClientsBySearch(params: TClientSearchQueryParams) {
	try {
		const { data } = await axios.post("/api/clients/search", params);

		return data.data as TGetClientsBySearchOutput;
	} catch (error) {
		console.log("Error running fetchClientsBySearch", error);
		throw error;
	}
}

type UseClientsBySearchParams = {
	initialParams: Partial<TClientSearchQueryParams>;
};
export function useClientsBySearch({ initialParams }: UseClientsBySearchParams) {
	const [queryParams, setQueryParams] = useState<TClientSearchQueryParams>({
		page: initialParams?.page || 1,
		name: initialParams?.name || "",
		phone: initialParams?.phone || "",
		acquisitionChannels: initialParams?.acquisitionChannels || [],
		rfmTitles: initialParams?.rfmTitles || [],
		total: {},
		saleNatures: [],
		excludedSalesIds: [],
		period: { after: initialParams?.period?.after, before: initialParams?.period?.before },
	});

	function updateQueryParams(newParams: Partial<TClientSearchQueryParams>) {
		setQueryParams((prevParams) => ({ ...prevParams, ...newParams }));
	}

	return {
		...useQuery({
			queryKey: ["clients-by-search", queryParams],
			queryFn: () => fetchClientsBySearch(queryParams),
		}),
		queryParams,
		updateQueryParams,
	};
}

async function fetchClientStatsById(input: TGetClientStatsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("clientId", input.clientId);
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter);
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore);
	const { data } = await axios.get<TGetClientStatsOutput>(`/api/clients/stats/by-client?${searchParams.toString()}`);
	return data.data;
}

type UseClientStatsByIdParams = {
	clientId: string;
	initialFilters: Partial<Omit<TGetClientStatsInput, "clientId">>;
};
export function useClientStatsById({ clientId, initialFilters }: UseClientStatsByIdParams) {
	const [filters, setFilters] = useState<Omit<TGetClientStatsInput, "clientId">>({
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
	});
	function updateFilters(newFilters: Partial<Omit<TGetClientStatsInput, "clientId">>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	return {
		...useQuery({
			queryKey: ["client-stats-by-id", clientId, filters],
			queryFn: () => fetchClientStatsById({ clientId, ...filters }),
		}),
		queryKey: ["client-stats-by-id", clientId, filters],
		filters,
		updateFilters,
	};
}

export async function fetchClientByLookup(input: TClientByLookupInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("orgId", input.orgId);
	searchParams.set("phone", input.phone);
	if (input.clientId) searchParams.set("clientId", input.clientId);
	const { data } = await axios.get<TClientByLookupOutput>(`/api/clients/lookup?${searchParams.toString()}`);
	return data.data;
}

type UseClientByLookupParams = {
	initialParams: Partial<TClientByLookupInput>;
};
export function useClientByLookup({ initialParams }: UseClientByLookupParams) {
	const [params, setParams] = useState<TClientByLookupInput>({
		orgId: initialParams?.orgId || "",
		phone: initialParams?.phone || "",
		clientId: initialParams?.clientId || null,
	});

	function updateParams(newParams: Partial<TClientByLookupInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedInput = useDebounceMemo(
		{
			orgId: params.orgId,
			phone: params.phone,
			clientId: params.clientId,
		},
		1500,
	);
	console.log("[INFO] Running useClientByLookup with input:", debouncedInput);
	return {
		...useQuery({
			queryKey: ["client-by-lookup", debouncedInput],
			queryFn: () => fetchClientByLookup(debouncedInput),
			enabled: !!(params.clientId || params.phone.length === 15),
		}),

		queryKey: ["client-by-lookup", debouncedInput],
		params,
		updateParams,
	};
}

async function fetchClientsOverallStats(input: TGetClientsOverallStatsInput) {
	const searchParams = new URLSearchParams();
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	// if (input.saleNatures && input.saleNatures.length > 0) searchParams.set("saleNatures", input.saleNatures.join(","));
	// if (input.excludedSalesIds && input.excludedSalesIds.length > 0) searchParams.set("excludedSalesIds", input.excludedSalesIds.join(","));
	// if (input.totalMin) searchParams.set("totalMin", input.totalMin.toString());
	// if (input.totalMax) searchParams.set("totalMax", input.totalMax.toString());
	if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
	if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
	const { data } = await axios.get<TGetClientsOverallStatsOutput>(`/api/clients/stats/overall?${searchParams.toString()}`);
	return data.data;
}

export function useClientsOverallStats(input: TGetClientsOverallStatsInput) {
	return {
		...useQuery({
			queryKey: ["clients-overall-stats", input],
			queryFn: () => fetchClientsOverallStats(input),
		}),
		queryKey: ["clients-overall-stats", input],
	};
}

async function fetchClientsGraph(input: TGetClientsGraphInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("graphType", input.graphType);
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
	if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
	const { data } = await axios.get<TGetClientsGraphOutput>(`/api/clients/stats/graph?${searchParams.toString()}`);
	return data.data;
}

export function useClientsGraph(input: TGetClientsGraphInput) {
	return {
		...useQuery({
			queryKey: ["clients-graph", input],
			queryFn: () => fetchClientsGraph(input),
		}),
		queryKey: ["clients-graph", input],
	};
}

async function fetchClientsRanking(input: TGetClientsRankingInput) {
	const searchParams = new URLSearchParams();
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
	if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
	if (input.rankingBy) searchParams.set("rankingBy", input.rankingBy);
	const { data } = await axios.get<TGetClientsRankingOutput>(`/api/clients/stats/ranking?${searchParams.toString()}`);
	return data.data;
}

export function useClientsRanking(input: TGetClientsRankingInput) {
	return {
		...useQuery({
			queryKey: ["clients-ranking", input],
			queryFn: () => fetchClientsRanking(input),
		}),
		queryKey: ["clients-ranking", input],
	};
}

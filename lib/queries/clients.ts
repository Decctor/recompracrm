import type { TGetClientsInput, TGetClientsOutput } from "@/app/api/clients/route";
import type { TClientByLookupInput, TClientByLookupOutput } from "@/app/api/clients/lookup/route";
import type { TSearchClientsOutput } from "@/app/api/clients/search/route";
import type { TGetClientStatsInput, TGetClientStatsOutput } from "@/app/api/clients/stats/by-client/route";
import type { TGetClientsGraphInput, TGetClientsGraphOutput } from "@/app/api/clients/stats/graph/route";
import type { TGetClientsOverallStatsInput, TGetClientsOverallStatsOutput } from "@/app/api/clients/stats/overall/route";
import type { TGetClientsRankingInput, TGetClientsRankingOutput } from "@/app/api/clients/stats/ranking/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useMemo, useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";
import { useDebouncedText } from "../hooks/use-debounced-text";
import { TGetClientTagsOutput } from "@/app/api/clients/tags/route";

async function fetchClients(input: TGetClientsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.acquisitionChannels.length > 0) searchParams.set("acquisitionChannels", input.acquisitionChannels.join(","));
		if (input.segmentationTitles.length > 0) searchParams.set("segmentationTitles", input.segmentationTitles.join(","));
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.statsIntegrationsIds.length > 0) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
		if (input.statsExcludedSalesIds.length > 0) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
		if (input.birthdaysPeriodAfter) searchParams.set("birthdaysPeriodAfter", input.birthdaysPeriodAfter.toISOString());
		if (input.birthdaysPeriodBefore) searchParams.set("birthdaysPeriodBefore", input.birthdaysPeriodBefore.toISOString());
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

export async function fetchClientById(clientId: string) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("id", clientId);
		searchParams.set("page", "1");
		const { data } = await axios.get<TGetClientsOutput>(`/api/clients?${searchParams.toString()}`);

		if (!data.data.byId) throw new Error("Cliente não encontrado.");
		return data.data.byId;
	} catch (error) {
		console.log("Error running fetchClientById", error);
		throw error;
	}
}

type UseClientByIdParams = {
	id: string;
};
export function useClientById({ id }: UseClientByIdParams) {
	const queryKey = ["client-by-id", id] as const;

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchClientById(id),
			enabled: !!id,
		}),
		queryKey,
	};
}

/**
 * Consulta pura da listagem: o estado dos filtros mora em quem chama. A página do banco de dados
 * guarda os filtros na URL (`lib/clients/database-url-state.ts`); `useClients` abaixo continua
 * existindo para telas que preferem estado local.
 */
export function useClientsQuery({ params }: { params: TGetClientsInput }) {
	const queryKey = ["clients", params];
	return {
		...useQuery({
			queryKey,
			queryFn: async () => await fetchClients(params),
		}),
		queryKey,
	};
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
		statsIntegrationsIds: initialFilters?.statsIntegrationsIds || [],
		statsExcludedSalesIds: initialFilters?.statsExcludedSalesIds || [],
		birthdaysPeriodAfter: initialFilters?.birthdaysPeriodAfter || null,
		birthdaysPeriodBefore: initialFilters?.birthdaysPeriodBefore || null,
		orderByField: initialFilters?.orderByField || "nome",
		orderByDirection: initialFilters?.orderByDirection || "asc",
		page: initialFilters?.page || 1,
	});
	function updateFilters(newFilters: Partial<TGetClientsInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 1000);
	return {
		...useClientsQuery({ params: debouncedFilters }),
		filters,
		updateFilters,
	};
}

export async function fetchClientsBySearch({ search, signal }: { search: string; signal?: AbortSignal }) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("search", search);
		const { data } = await axios.get<TSearchClientsOutput>(`/api/clients/search?${searchParams.toString()}`, { signal });

		return data.data.clients;
	} catch (error) {
		if (!axios.isCancel(error)) console.log("Error running fetchClientsBySearch", error);
		throw error;
	}
}

async function fetchClientsByIds({ clientIds }: { clientIds: string[] }) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("clientIds", clientIds.join(","));
		const { data } = await axios.get<TSearchClientsOutput>(`/api/clients/search?${searchParams.toString()}`);

		return data.data.clients;
	} catch (error) {
		console.log("Error running fetchClientsByIds", error);
		throw error;
	}
}

/**
 * Hidrata clientes já selecionados a partir dos IDs — o que a busca por texto não faz.
 * Usado por seletores que persistem só IDs (ex.: escopo de atendimento do agente de IA), para
 * renderizar nome e telefone sem denormalizar esses campos no registro salvo.
 */
export function useClientsByIds({ clientIds }: { clientIds: string[] }) {
	// Ordenado e deduplicado: a queryKey não pode variar com a ordem de clique do usuário.
	const stableIds = useMemo(() => [...new Set(clientIds)].sort(), [clientIds]);
	const queryKey = ["clients-by-ids", stableIds];

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchClientsByIds({ clientIds: stableIds }),
			enabled: stableIds.length > 0,
		}),
		queryKey,
	};
}

type UseClientsBySearchParams = {
	initialSearch?: string;
};
export function useClientsBySearch({ initialSearch = "" }: UseClientsBySearchParams) {
	const [search, setSearch] = useState(initialSearch);
	const debouncedSearch = useDebouncedText(search).trim();
	const queryKey = ["clients-by-search", debouncedSearch];
	const isSearchPending = search.trim() !== debouncedSearch.trim();

	function updateSearch(value: string) {
		setSearch(value);
	}

	return {
		...useQuery({
			queryKey,
			queryFn: ({ signal }) => fetchClientsBySearch({ search: debouncedSearch, signal }),
			enabled: debouncedSearch.length >= 2,
		}),
		queryKey,
		search,
		debouncedSearch,
		isSearchPending,
		setSearch,
		updateSearch,
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
	if (input.orgId) searchParams.set("orgId", input.orgId);
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

	const updateParams = useCallback((newParams: Partial<TClientByLookupInput>) => {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}, []);
	const debouncedInput = useDebounceMemo(
		{
			orgId: params.orgId,
			phone: params.phone,
			clientId: params.clientId,
		},
		1500,
	);
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

async function fetchClientTags() {
	const { data } = await axios.get<TGetClientTagsOutput>("/api/clients/tags");
	return data.data.default;
}

export function useClientTags() {
	return {
		...useQuery({
			queryKey: ["client-tags"],
			queryFn: () => fetchClientTags(),
		}),
		queryKey: ["client-tags"],
	};
}

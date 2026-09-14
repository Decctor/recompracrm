import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { useState } from "react";
import type { TGetStoreCreditOutput, TGetStoreCreditOutputByClient, TGetStoreCreditOutputDefault } from "@/app/api/finances/store-credit/route";
import type { TGetStoreCreditStatsOutput } from "@/app/api/finances/store-credit/stats/route";
import { useDebounceMemo } from "@/lib/hooks/use-debounce";
import type { TStoreCreditAgingBucket } from "@/lib/finances/store-credit/aging";
import type { TStoreCreditSortDirection, TStoreCreditSortField, TStoreCreditStatus } from "@/lib/finances/store-credit/constants";

export type TStoreCreditClientsFilters = {
	page: number;
	search: string;
	statuses: TStoreCreditStatus[];
	agingBuckets: TStoreCreditAgingBucket[];
	sortField: TStoreCreditSortField;
	sortDirection: TStoreCreditSortDirection;
	/** Quando o fiado foi gerado (a venda). Nulo dos dois lados = sem recorte, que é o padrão. */
	originAfter: Date | null;
	originBefore: Date | null;
};

/** O recorte de origem viaja junto para a expansão e o menu de baixa concordarem com a listagem. */
export type TStoreCreditOriginScope = { originAfter: Date | null; originBefore: Date | null };

export function hasStoreCreditOriginScope(scope: TStoreCreditOriginScope | null | undefined) {
	return !!scope && (!!scope.originAfter || !!scope.originBefore);
}

async function fetchStoreCreditClients(filters: TStoreCreditClientsFilters): Promise<TGetStoreCreditOutputDefault> {
	const searchParams = new URLSearchParams();
	searchParams.set("page", filters.page.toString());
	if (filters.search.trim()) searchParams.set("search", filters.search.trim());
	if (filters.statuses.length > 0) searchParams.set("statuses", filters.statuses.join(","));
	if (filters.agingBuckets.length > 0) searchParams.set("agingBuckets", filters.agingBuckets.join(","));
	if (filters.originAfter) searchParams.set("originAfter", filters.originAfter.toISOString());
	if (filters.originBefore) searchParams.set("originBefore", filters.originBefore.toISOString());
	searchParams.set("sortField", filters.sortField);
	searchParams.set("sortDirection", filters.sortDirection);

	const { data } = await axios.get<TGetStoreCreditOutput>(`/api/finances/store-credit?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar os fiados.");
	return result;
}

/**
 * Listagem de clientes com fiado. O padrão é `EM_ABERTO` — a aba é uma ferramenta de cobrança, e
 * abrir com o histórico quitado junto enterraria quem precisa ser cobrado no meio de quem já pagou.
 */
export function useStoreCreditClients({ initialFilters }: { initialFilters?: Partial<TStoreCreditClientsFilters> } = {}) {
	const [filters, setFilters] = useState<TStoreCreditClientsFilters>({
		page: initialFilters?.page ?? 1,
		search: initialFilters?.search ?? "",
		statuses: initialFilters?.statuses ?? ["EM_ABERTO"],
		agingBuckets: initialFilters?.agingBuckets ?? [],
		sortField: initialFilters?.sortField ?? "saldo",
		sortDirection: initialFilters?.sortDirection ?? "desc",
		originAfter: initialFilters?.originAfter ?? null,
		originBefore: initialFilters?.originBefore ?? null,
	});

	function updateFilters(newFilters: Partial<TStoreCreditClientsFilters>) {
		setFilters((previous) => ({ ...previous, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["store-credit-clients", finalFilters];

	return {
		...useQuery({ queryKey, queryFn: () => fetchStoreCreditClients(finalFilters) }),
		queryKey,
		filters,
		updateFilters,
	};
}

async function fetchStoreCreditClientTitles({
	clientId,
	includeSettled,
	scope,
}: {
	clientId: string;
	includeSettled: boolean;
	scope: TStoreCreditOriginScope | null;
}): Promise<TGetStoreCreditOutputByClient> {
	const searchParams = new URLSearchParams();
	searchParams.set("clientId", clientId);
	if (includeSettled) searchParams.set("includeSettled", "true");
	if (scope?.originAfter) searchParams.set("originAfter", scope.originAfter.toISOString());
	if (scope?.originBefore) searchParams.set("originBefore", scope.originBefore.toISOString());

	const { data } = await axios.get<TGetStoreCreditOutput>(`/api/finances/store-credit?${searchParams.toString()}`);
	const result = data.data.byClient;
	if (!result) throw new Error("Oops, houve um erro ao buscar os fiados do cliente.");
	return result;
}

export function useStoreCreditClientTitles({
	clientId,
	includeSettled = false,
	enabled = true,
	scope = null,
}: {
	clientId: string;
	includeSettled?: boolean;
	enabled?: boolean;
	scope?: TStoreCreditOriginScope | null;
}) {
	// O recorte entra na chave: sem ele, abrir a expansão sob o filtro de setembro serviria o cache
	// da consulta sem filtro, e a tela mostraria títulos que a linha do cliente não contou.
	const queryKey = ["store-credit-client-titles", clientId, includeSettled, scope?.originAfter ?? null, scope?.originBefore ?? null];
	return {
		...useQuery({ queryKey, queryFn: () => fetchStoreCreditClientTitles({ clientId, includeSettled, scope }), enabled: enabled && !!clientId }),
		queryKey,
	};
}

export type TStoreCreditStatsParams = { periodAfter: Date; periodBefore: Date };

async function fetchStoreCreditStats(params: TStoreCreditStatsParams) {
	const searchParams = new URLSearchParams();
	searchParams.set("periodAfter", params.periodAfter.toISOString());
	searchParams.set("periodBefore", params.periodBefore.toISOString());

	const { data } = await axios.get<TGetStoreCreditStatsOutput>(`/api/finances/store-credit/stats?${searchParams.toString()}`);
	return data.data;
}

export function useStoreCreditStats({
	initialParams,
	staleTime,
	refetchInterval,
}: { initialParams?: Partial<TStoreCreditStatsParams>; staleTime?: number; refetchInterval?: number } = {}) {
	const [params, setParams] = useState<TStoreCreditStatsParams>({
		periodAfter: initialParams?.periodAfter ?? dayjs().startOf("month").toDate(),
		periodBefore: initialParams?.periodBefore ?? dayjs().endOf("month").toDate(),
	});

	function updateParams(newParams: Partial<TStoreCreditStatsParams>) {
		setParams((previous) => ({ ...previous, ...newParams }));
	}

	// A chave é derivada só do período, então a badge da sidebar e a página compartilham o mesmo
	// cache enquanto o período for o padrão — uma requisição serve as duas.
	const queryKey = ["store-credit-stats", params];
	return { ...useQuery({ queryKey, queryFn: () => fetchStoreCreditStats(params), staleTime, refetchInterval }), queryKey, params, updateParams };
}

/**
 * Invalidação do módulo. A baixa mexe no financeiro inteiro (movimentações, saldos, DRE), então a
 * tela também chama `invalidateFinanceQueries` — estas chaves são as que só existem aqui.
 */
export const STORE_CREDIT_QUERY_PREFIXES = [["store-credit-clients"], ["store-credit-client-titles"], ["store-credit-stats"]] as const;

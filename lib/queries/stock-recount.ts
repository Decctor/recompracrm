import type { TGetStockRecountOutput, TGetStockRecountOutputDefault } from "@/app/api/products/stock-recount/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useDebounceMemo } from "./../hooks/use-debounce";

export type TStockRecountRowsFilters = {
	page: number;
	pageSize: number;
	search: string;
};

async function fetchStockRecountRows(filters: TStockRecountRowsFilters) {
	const searchParams = new URLSearchParams();
	if (filters.page) searchParams.set("page", filters.page.toString());
	if (filters.pageSize) searchParams.set("pageSize", filters.pageSize.toString());
	if (filters.search) searchParams.set("search", filters.search);

	const { data } = await axios.get<TGetStockRecountOutput>(`/api/products/stock-recount?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Linhas de recontagem não encontradas.");
	return result;
}

type UseStockRecountRowsParams = {
	initialFilters?: Partial<TStockRecountRowsFilters>;
};
export function useStockRecountRows({ initialFilters }: UseStockRecountRowsParams = {}) {
	const [filters, setFilters] = useState<TStockRecountRowsFilters>({
		page: initialFilters?.page ?? 1,
		pageSize: initialFilters?.pageSize ?? DEFAULT_PAGE_SIZE,
		search: initialFilters?.search ?? "",
	});

	function updateFilters(newFilters: Partial<TStockRecountRowsFilters>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	// Apenas a busca é debounced — troca de página aplica imediatamente.
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 800);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["stock-recount-rows", finalFilters];

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchStockRecountRows(finalFilters),
		}),
		queryKey,
		filters,
		updateFilters,
	};
}
export type TStockRecountRows = TGetStockRecountOutputDefault;

async function fetchStockRecountBalances(entityIds: string[]) {
	const searchParams = new URLSearchParams();
	searchParams.set("entityIds", entityIds.join(","));

	const { data } = await axios.get<TGetStockRecountOutput>(`/api/products/stock-recount?${searchParams.toString()}`);
	const result = data.data.byEntityIds;
	if (!result) throw new Error("Saldos atuais não encontrados.");
	return result;
}

type UseStockRecountBalancesParams = {
	entityIds: string[];
	enabled?: boolean;
};
export function useStockRecountBalances({ entityIds, enabled = true }: UseStockRecountBalancesParams) {
	const queryKey = ["stock-recount-balances", entityIds];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchStockRecountBalances(entityIds),
			enabled: enabled && entityIds.length > 0,
			// O passo de confirmação compara contra o saldo mais fresco possível.
			refetchOnMount: "always" as const,
			staleTime: 0,
		}),
		queryKey,
	};
}

async function fetchStockRecountRowsByProductId(productId: string) {
	const { data } = await axios.get<TGetStockRecountOutput>(`/api/products/stock-recount?productId=${productId}`);
	const result = data.data.byProductId;
	if (!result) throw new Error("Linhas de recontagem do produto não encontradas.");
	return result;
}

type UseStockRecountRowsByProductIdParams = {
	productId: string;
	enabled?: boolean;
};
export function useStockRecountRowsByProductId({ productId, enabled = true }: UseStockRecountRowsByProductIdParams) {
	const queryKey = ["stock-recount-rows-by-product", productId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchStockRecountRowsByProductId(productId),
			enabled: enabled && !!productId,
			refetchOnMount: "always" as const,
			staleTime: 0,
		}),
		queryKey,
	};
}

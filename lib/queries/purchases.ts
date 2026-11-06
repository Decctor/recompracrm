import { TGetPurchasesByIdInput, TGetPurchasesDefaultInput, TGetPurchasesOutput } from "@/app/api/purchases/route";
import axios from "axios";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";
import { useQuery } from "@tanstack/react-query";

async function fetchPurchases(input: TGetPurchasesDefaultInput) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.status.length > 0) searchParams.set("status", input.status.join(","));
	const { data } = await axios.get<TGetPurchasesOutput>(`/api/purchases?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as compras.");
	return result;
}

type UsePurchasesParams = {
	initialFilters?: Partial<TGetPurchasesDefaultInput>;
};
export function usePurchases({ initialFilters }: UsePurchasesParams) {
	const [filters, setFilters] = useState<TGetPurchasesDefaultInput>({
		page: initialFilters?.page || 1,
		pageSize: initialFilters?.pageSize ?? DEFAULT_PAGE_SIZE,
		search: initialFilters?.search || "",
		status: initialFilters?.status || [],
	});
	function updateFilters(newFilters: Partial<TGetPurchasesDefaultInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo(
		{
			search: filters.search,
		},
		1000,
	);

	const finalFilters = { ...filters, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["purchases", finalFilters],
			queryFn: () => fetchPurchases(finalFilters),
		}),
		queryKey: ["purchases", finalFilters],
		filters,
		updateFilters,
	};
}

async function fetchPurchaseById(input: TGetPurchasesByIdInput) {
	const { data } = await axios.get<TGetPurchasesOutput>(`/api/purchases?id=${input.id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar a compra.");
	return result;
}

export function usePurchaseById({ id }: TGetPurchasesByIdInput) {
	return {
		...useQuery({
			queryKey: ["purchase-by-id", id],
			queryFn: () => fetchPurchaseById({ id }),
		}),
		queryKey: ["purchase-by-id", id],
	};
}

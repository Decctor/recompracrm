import { TGetPurchasesByIdInput, TGetPurchasesDefaultInput, TGetPurchasesOutput } from "@/app/api/purchases/route";
import axios from "axios";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

async function fetchPurchases(input: TGetPurchasesDefaultInput) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.status.length > 0) searchParams.set("status", input.status.join(","));
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.supplierIds.length > 0) searchParams.set("supplierIds", input.supplierIds.join(","));
	if (input.origins.length > 0) searchParams.set("origins", input.origins.join(","));
	if (input.valueMin != null) searchParams.set("valueMin", input.valueMin.toString());
	if (input.valueMax != null) searchParams.set("valueMax", input.valueMax.toString());
	if (input.orderByField) searchParams.set("orderByField", input.orderByField);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	const { data } = await axios.get<TGetPurchasesOutput>(`/api/purchases?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as compras.");
	return result;
}

export const DEFAULT_PURCHASES_FILTERS: TGetPurchasesDefaultInput = {
	page: 1,
	pageSize: DEFAULT_PAGE_SIZE,
	search: "",
	status: [],
	periodAfter: null,
	periodBefore: null,
	supplierIds: [],
	origins: [],
	valueMin: null,
	valueMax: null,
	orderByField: "dataInsercao",
	orderByDirection: "desc",
};

type UsePurchasesParams = {
	initialFilters?: Partial<TGetPurchasesDefaultInput>;
};
export function usePurchases({ initialFilters }: UsePurchasesParams) {
	const [filters, setFilters] = useState<TGetPurchasesDefaultInput>({ ...DEFAULT_PURCHASES_FILTERS, ...initialFilters });
	function updateFilters(newFilters: Partial<TGetPurchasesDefaultInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo(
		{
			search: filters.search,
		},
		500,
	);

	const finalFilters = { ...filters, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["purchases", finalFilters],
			queryFn: () => fetchPurchases(finalFilters),
			placeholderData: keepPreviousData,
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

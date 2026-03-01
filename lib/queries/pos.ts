import type { TGetSaleDraftOutput } from "@/app/api/pos/sales/route";
import type { TGetPOSGroupsOutput } from "@/pages/api/pos/groups";
import type { TGetPOSProductsInput, TGetPOSProductsOutput } from "@/pages/api/pos/products";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

// Fetch POS products
async function fetchPOSProducts(input: TGetPOSProductsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.group) searchParams.set("group", input.group);

		const { data } = await axios.get<TGetPOSProductsOutput>(`/api/pos/products?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPOSProducts", error);
		throw error;
	}
}

type UsePOSProductsParams = {
	initialFilters?: Partial<TGetPOSProductsInput>;
};

export function usePOSProducts({ initialFilters }: UsePOSProductsParams = {}) {
	const [filters, setFilters] = useState<TGetPOSProductsInput>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		group: initialFilters?.group || null,
	});

	function updateFilters(newParams: Partial<TGetPOSProductsInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newParams, page: newParams.page ?? 1 }));
	}

	const debouncedFilters = useDebounceMemo(filters, 300);

	return {
		...useQuery({
			queryKey: ["pos-products", debouncedFilters],
			queryFn: () => fetchPOSProducts(debouncedFilters),
		}),
		queryKey: ["pos-products", debouncedFilters],
		filters,
		updateFilters,
	};
}

// Fetch POS groups
async function fetchPOSGroups() {
	try {
		const { data } = await axios.get<TGetPOSGroupsOutput>("/api/pos/groups");
		return data.data;
	} catch (error) {
		console.log("Error running fetchPOSGroups", error);
		throw error;
	}
}

export function usePOSGroups() {
	return useQuery({
		queryKey: ["pos-groups"],
		queryFn: fetchPOSGroups,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// ============================================================================
// Fetch POS sale draft by ID (for checkout page)
// ============================================================================

async function fetchSaleDraft(saleId: string) {
	const { data } = await axios.get<TGetSaleDraftOutput>(`/api/pos/sales?id=${saleId}`);
	const result = data.data.sale;
	if (!result) throw new Error("Rascunho de venda não encontrado.");
	return result;
}

export function useSaleDraft({ saleId }: { saleId: string }) {
	const queryKey = ["pos-sale-draft", saleId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchSaleDraft(saleId),
			enabled: !!saleId,
		}),
		queryKey,
	};
}

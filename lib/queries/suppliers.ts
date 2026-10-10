import type { TGetSuppliersOutput } from "@/app/api/suppliers/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchSuppliersBySearch({ search }: { search: string }) {
	const searchParams = new URLSearchParams();
	if (search.trim().length > 0) searchParams.set("search", search);
	searchParams.set("activeOnly", "true");
	const { data } = await axios.get<TGetSuppliersOutput>(`/api/suppliers?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Erro ao buscar fornecedores.");
	return result.suppliers;
}

type UseSuppliersBySearchParams = {
	initialSearch?: string;
};
export function useSuppliersBySearch({ initialSearch = "" }: UseSuppliersBySearchParams = {}) {
	const [search, setSearch] = useState(initialSearch);
	const debouncedParams = useDebounceMemo({ search }, 800);
	const queryKey = ["suppliers-by-search", debouncedParams.search];

	function updateSearch(value: string) {
		setSearch(value);
	}

	return {
		// Empty search is intentionally enabled: it lists the most recent suppliers as the popover's initial state.
		...useQuery({
			queryKey,
			queryFn: () => fetchSuppliersBySearch({ search: debouncedParams.search }),
		}),
		queryKey,
		search,
		updateSearch,
	};
}

async function fetchSupplierById(id: string) {
	const { data } = await axios.get<TGetSuppliersOutput>(`/api/suppliers?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Fornecedor não encontrado.");
	return result;
}

export function useSupplierById({ supplierId }: { supplierId: string }) {
	return {
		...useQuery({
			queryKey: ["supplier-by-id", supplierId],
			queryFn: () => fetchSupplierById(supplierId),
			enabled: !!supplierId,
		}),
		queryKey: ["supplier-by-id", supplierId],
	};
}

// Opções de filtro (ex.: produtos por fornecedor principal): inclui inativos, que ainda podem estar vinculados.
async function fetchSupplierOptions() {
	const searchParams = new URLSearchParams();
	searchParams.set("limit", "500");
	const { data } = await axios.get<TGetSuppliersOutput>(`/api/suppliers?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Erro ao buscar fornecedores.");
	return result.suppliers;
}

export function useSupplierOptions({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: ["supplier-options"],
			queryFn: fetchSupplierOptions,
			enabled,
		}),
		queryKey: ["supplier-options"],
	};
}

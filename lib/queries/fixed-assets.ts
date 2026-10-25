import type { TGetFixedAssetsPendingMonthsOutput } from "@/app/api/fixed-assets/actions/route";
import type { TGetFixedAssetsOutput } from "@/app/api/fixed-assets/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

type FixedAssetsFilters = {
	page: number;
	search: string;
	statuses: string[];
};

async function fetchFixedAssets(filters: FixedAssetsFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", filters.page.toString());
	if (filters.search) searchParams.set("search", filters.search);
	if (filters.statuses.length > 0) searchParams.set("statuses", filters.statuses.join(","));
	const { data } = await axios.get<TGetFixedAssetsOutput>(`/api/fixed-assets?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar os bens.");
	return result;
}

export function useFixedAssets({ initialFilters }: { initialFilters?: Partial<FixedAssetsFilters> } = {}) {
	const [filters, setFilters] = useState<FixedAssetsFilters>({
		page: initialFilters?.page ?? 1,
		search: initialFilters?.search ?? "",
		statuses: initialFilters?.statuses ?? ["EM_USO", "EM_MANUTENCAO"],
	});
	function updateFilters(next: Partial<FixedAssetsFilters>) {
		setFilters((previous) => ({ ...previous, ...next }));
	}
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 400);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["fixed-assets", finalFilters];
	return { ...useQuery({ queryKey, queryFn: () => fetchFixedAssets(finalFilters) }), queryKey, filters, updateFilters };
}

async function fetchFixedAssetById(id: string) {
	const { data } = await axios.get<TGetFixedAssetsOutput>(`/api/fixed-assets?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar o bem.");
	return result;
}

export function useFixedAssetById({ assetId }: { assetId: string }) {
	const queryKey = ["fixed-asset-by-id", assetId];
	return { ...useQuery({ queryKey, queryFn: () => fetchFixedAssetById(assetId) }), queryKey };
}

async function fetchFixedAssetsPendingMonths() {
	const { data } = await axios.get<TGetFixedAssetsPendingMonthsOutput>("/api/fixed-assets/actions");
	return data.data.pending;
}

export function useFixedAssetsPendingMonths() {
	const queryKey = ["fixed-assets-pending-months"];
	return { ...useQuery({ queryKey, queryFn: fetchFixedAssetsPendingMonths }), queryKey };
}

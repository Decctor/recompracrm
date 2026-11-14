import type { TGetProductionByIdInput, TGetProductionsDefaultInput, TGetProductionsOutput } from "@/app/api/productions/route";
import type {
	TGetProductionRecipeByIdInput,
	TGetProductionRecipesDefaultInput,
	TGetProductionRecipesOutput,
} from "@/app/api/productions/recipes/route";
import type { TGetProductionStatsInput, TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "./../hooks/use-debounce";

async function fetchProductions(input: TGetProductionsDefaultInput) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.status.length > 0) searchParams.set("status", input.status.join(","));
	if (input.origem.length > 0) searchParams.set("origem", input.origem.join(","));
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.recipeIds.length > 0) searchParams.set("recipeIds", input.recipeIds.join(","));
	if (input.compositions.length > 0) searchParams.set("compositions", input.compositions.join(","));
	if (input.orderBy) searchParams.set("orderBy", input.orderBy);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());

	const { data } = await axios.get<TGetProductionsOutput>(`/api/productions?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Produções não encontradas.");
	return result;
}

type UseProductionsParams = {
	initialFilters?: Partial<TGetProductionsDefaultInput>;
};
export function useProductions({ initialFilters }: UseProductionsParams = {}) {
	const [filters, setFilters] = useState<TGetProductionsDefaultInput>({
		page: initialFilters?.page ?? 1,
		search: initialFilters?.search ?? "",
		status: initialFilters?.status ?? [],
		origem: initialFilters?.origem ?? [],
		periodAfter: initialFilters?.periodAfter ?? null,
		periodBefore: initialFilters?.periodBefore ?? null,
		recipeIds: initialFilters?.recipeIds ?? [],
		compositions: initialFilters?.compositions ?? [],
		orderBy: initialFilters?.orderBy ?? "DATA",
		orderByDirection: initialFilters?.orderByDirection ?? "desc",
		pageSize: initialFilters?.pageSize ?? 10,
	});

	function updateFilters(newFilters: Partial<TGetProductionsDefaultInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo(
		{
			search: filters.search,
		},
		800,
	);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["productions", finalFilters];

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductions(finalFilters),
		}),
		queryKey,
		filters,
		updateFilters,
	};
}

async function fetchProductionById(input: TGetProductionByIdInput) {
	const { data } = await axios.get<TGetProductionsOutput>(`/api/productions?id=${input.id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Produção não encontrada.");
	return result;
}

export function useProductionById({ id }: TGetProductionByIdInput) {
	const queryKey = ["production-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductionById({ id }),
			enabled: !!id,
		}),
		queryKey,
	};
}

async function fetchProductionRecipes(input: TGetProductionRecipesDefaultInput) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.activeOnly !== undefined && input.activeOnly !== null) searchParams.set("activeOnly", String(input.activeOnly));
	if (input.orderBy) searchParams.set("orderBy", input.orderBy);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());

	const { data } = await axios.get<TGetProductionRecipesOutput>(`/api/productions/recipes?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Receitas de produção não encontradas.");
	return result;
}

type UseProductionRecipesParams = {
	initialFilters?: Partial<TGetProductionRecipesDefaultInput>;
};
export function useProductionRecipes({ initialFilters }: UseProductionRecipesParams = {}) {
	const [filters, setFilters] = useState<TGetProductionRecipesDefaultInput>({
		page: initialFilters?.page ?? 1,
		search: initialFilters?.search ?? "",
		activeOnly: initialFilters?.activeOnly ?? true,
		orderBy: initialFilters?.orderBy ?? "ULTIMA_PRODUCAO",
		orderByDirection: initialFilters?.orderByDirection ?? "desc",
		pageSize: initialFilters?.pageSize ?? 50,
	});

	function updateFilters(newFilters: Partial<TGetProductionRecipesDefaultInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo(
		{
			search: filters.search,
		},
		800,
	);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["production-recipes", finalFilters];

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductionRecipes(finalFilters),
		}),
		queryKey,
		filters,
		updateFilters,
	};
}

export async function fetchProductionRecipeById(input: TGetProductionRecipeByIdInput) {
	const { data } = await axios.get<TGetProductionRecipesOutput>(`/api/productions/recipes?id=${input.id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Receita de produção não encontrada.");
	return result;
}

export function useProductionRecipeById({ id }: TGetProductionRecipeByIdInput) {
	const queryKey = ["production-recipe-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductionRecipeById({ id }),
			enabled: !!id,
		}),
		queryKey,
	};
}

async function fetchProductionStats(input: TGetProductionStatsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("periodAfter", input.periodAfter.toISOString());
	searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
	if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
	if (input.recipeIds.length > 0) searchParams.set("recipeIds", input.recipeIds.join(","));

	const { data } = await axios.get<TGetProductionStatsOutput>(`/api/productions/stats?${searchParams.toString()}`);
	return data.data;
}

export function useProductionStats(input: TGetProductionStatsInput) {
	const queryKey = [
		"production-stats",
		input.periodAfter.toISOString(),
		input.periodBefore.toISOString(),
		input.comparingPeriodAfter?.toISOString() ?? null,
		input.comparingPeriodBefore?.toISOString() ?? null,
		input.recipeIds,
	];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductionStats(input),
			placeholderData: keepPreviousData,
		}),
		queryKey,
	};
}

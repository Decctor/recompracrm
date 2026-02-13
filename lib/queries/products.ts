import type { TGetProductsByIdInput, TGetProductsDefaultInput, TGetProductsInput, TGetProductsOutput } from "@/pages/api/products";
import type { TGetProductsByCodesInput, TGetProductsByCodesOutput } from "@/pages/api/products/by-codes";
import type { TGetProductGraphInput, TGetProductGraphOutput } from "@/pages/api/products/graph";
import type { TGetProductsBySearchInput, TGetProductsBySearchOutput } from "@/pages/api/products/search";
import type { TGetProductStatsInput, TGetProductStatsOutput } from "@/pages/api/products/stats";
import type { TGetProductsGraphInput, TGetProductsGraphOutput } from "@/pages/api/products/stats/graph";
import type { TGetProductsOverallStatsInput, TGetProductsOverallStatsOutput } from "@/pages/api/products/stats/overall";
import type { TGetProductsRankingInput, TGetProductsRankingOutput } from "@/pages/api/products/stats/ranking";
import type { TProductStatsQueryParams } from "@/schemas/products";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchProducts(input: TGetProductsDefaultInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.groups) searchParams.set("groups", input.groups.join(","));
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsSaleNatures) searchParams.set("statsSaleNatures", input.statsSaleNatures.join(","));
		if (input.statsExcludedSalesIds) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
		if (input.statsTotalMin) searchParams.set("statsTotalMin", input.statsTotalMin.toString());
		if (input.statsTotalMax) searchParams.set("statsTotalMax", input.statsTotalMax.toString());
		if (input.stockStatus && input.stockStatus.length > 0) searchParams.set("stockStatus", input.stockStatus.join(","));
		if (input.priceMin) searchParams.set("priceMin", input.priceMin.toString());
		if (input.priceMax) searchParams.set("priceMax", input.priceMax.toString());
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		if (input.statsSellerIds) searchParams.set("statsSellerIds", input.statsSellerIds.join(","));
		const { data } = await axios.get<TGetProductsOutput>(`/api/products?${searchParams.toString()}`);
		const result = data.data.default;
		if (!result) throw new Error("Produtos não encontrados.");
		return result;
	} catch (error) {
		console.log("Error running fetchProducts", error);
		throw error;
	}
}

async function fetchProductById(input: TGetProductsByIdInput) {
	try {
		const { data } = await axios.get<TGetProductsOutput>(`/api/products?id=${input.id}`);
		const result = data.data.byId;
		if (!result) throw new Error("Produto não encontrado.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductById", error);
		throw error;
	}
}

export function useProductById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["product-by-id", id],
			queryFn: () => fetchProductById({ id }),
		}),
		queryKey: ["product-by-id", id],
	};
}

type UseProductsParams = {
	initialFilters?: Partial<TGetProductsDefaultInput>;
};
export function useProducts({ initialFilters }: UseProductsParams) {
	const [filters, setFilters] = useState<TGetProductsDefaultInput>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		groups: initialFilters?.groups || [],
		statsSellerIds: initialFilters?.statsSellerIds || [],
		statsPeriodBefore: initialFilters?.statsPeriodBefore || null,
		statsPeriodAfter: initialFilters?.statsPeriodAfter || null,
		statsSaleNatures: initialFilters?.statsSaleNatures || [],
		statsExcludedSalesIds: initialFilters?.statsExcludedSalesIds || [],
		statsTotalMin: initialFilters?.statsTotalMin || null,
		statsTotalMax: initialFilters?.statsTotalMax || null,
		stockStatus: initialFilters?.stockStatus || [],
		priceMin: initialFilters?.priceMin || null,
		priceMax: initialFilters?.priceMax || null,
		orderByField: initialFilters?.orderByField || "descricao",
		orderByDirection: initialFilters?.orderByDirection || "asc",
	});
	function updateFilters(newParams: Partial<TGetProductsDefaultInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newParams }));
	}

	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["products", debouncedFilters],
			queryFn: () => fetchProducts(debouncedFilters),
		}),
		queryKey: ["products", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchProductStats(input: TGetProductStatsInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productId", input.productId);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter);
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore);
		if (input.sellerId) searchParams.set("sellerId", input.sellerId);
		if (input.partnerId) searchParams.set("partnerId", input.partnerId);
		if (input.saleNatures && input.saleNatures.length > 0) {
			searchParams.set("saleNatures", JSON.stringify(input.saleNatures));
		}
		const { data } = await axios.get<TGetProductStatsOutput>(`/api/products/stats?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductStats", error);
		throw error;
	}
}

type UseProductStatsParams = {
	productId: string;
	initialFilters?: Partial<Omit<TGetProductStatsInput, "productId">>;
};
export function useProductStats({ productId, initialFilters }: UseProductStatsParams) {
	const [filters, setFilters] = useState<Omit<TGetProductStatsInput, "productId">>({
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
		sellerId: initialFilters?.sellerId || null,
		partnerId: initialFilters?.partnerId || null,
		saleNatures: initialFilters?.saleNatures || null,
	});
	function updateFilters(newFilters: Partial<Omit<TGetProductStatsInput, "productId">>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 1000);
	return {
		...useQuery({
			queryKey: ["product-stats", productId, debouncedFilters],
			queryFn: () => fetchProductStats({ productId, ...debouncedFilters }),
		}),
		queryKey: ["product-stats", productId, debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchProductGraph(input: TGetProductGraphInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productId", input.productId);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter);
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore);
		if (input.sellerId) searchParams.set("sellerId", input.sellerId);
		if (input.partnerId) searchParams.set("partnerId", input.partnerId);
		if (input.saleNatures && input.saleNatures.length > 0) {
			searchParams.set("saleNatures", JSON.stringify(input.saleNatures));
		}
		const { data } = await axios.get<TGetProductGraphOutput>(`/api/products/graph?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductGraph", error);
		throw error;
	}
}

export function useProductGraph(input: TGetProductGraphInput) {
	return useQuery({
		queryKey: ["product-graph", input],
		queryFn: () => fetchProductGraph(input),
	});
}

async function fetchProductsBySearch(input: TGetProductsBySearchInput) {
	const urlParams = new URLSearchParams();
	urlParams.set("search", input.search);
	urlParams.set("page", input.page.toString());
	const { data } = await axios.get<TGetProductsBySearchOutput>(`/api/products/search?${urlParams.toString()}`);
	return data.data;
}

type UseProductsBySearchParams = {
	initialParams?: Partial<TGetProductsBySearchInput>;
};
export function useProductsBySearch({ initialParams }: UseProductsBySearchParams) {
	const [params, setParams] = useState<TGetProductsBySearchInput>({
		search: initialParams?.search || "",
		page: initialParams?.page || 1,
	});
	function updateParams(newParams: Partial<TGetProductsBySearchInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedParams = useDebounceMemo(params, 1000);
	return {
		...useQuery({
			queryKey: ["products-by-search", debouncedParams],
			queryFn: () => fetchProductsBySearch(debouncedParams),
		}),
		queryKey: ["products-by-search", debouncedParams],
		params,
		updateParams,
	};
}

type TProductsBySearchProduct = TGetProductsBySearchOutput["data"]["products"][number];
type UseProductsBySearchInfiniteQueryParams = {
	initialSearch?: string;
};
export function useProductsBySearchInfiniteQuery({ initialSearch = "" }: UseProductsBySearchInfiniteQueryParams = {}) {
	const [search, setSearch] = useState(initialSearch);
	const debouncedSearch = useDebounceMemo({ search }, 500);
	const query = useInfiniteQuery({
		queryKey: ["products-by-search-infinite-query", debouncedSearch.search],
		queryFn: ({ pageParam }) => fetchProductsBySearch({ search: debouncedSearch.search, page: pageParam }),
		initialPageParam: 1,
		getNextPageParam: (lastPage, allPages) => {
			const nextPage = allPages.length + 1;
			return nextPage <= lastPage.totalPages ? nextPage : undefined;
		},
		refetchOnWindowFocus: false,
	});

	const products = useMemo<TProductsBySearchProduct[]>(() => {
		const allProducts = query.data?.pages.flatMap((page) => page.products) ?? [];
		return allProducts.reduce<TProductsBySearchProduct[]>((prev, current) => {
			const ids = new Set(prev.map((item) => item.id));
			if (ids.has(current.id)) return prev;
			prev.push(current);
			return prev;
		}, []);
	}, [query.data?.pages]);

	const firstPage = query.data?.pages[0];
	const totalPages = firstPage?.totalPages ?? 0;
	const productsMatched = firstPage?.productsMatched ?? 0;
	const hasMorePages = query.hasNextPage ?? false;
	const page = query.data?.pages.length ?? 1;

	function updateSearch(value: string) {
		setSearch(value);
	}

	function loadMore() {
		if (!hasMorePages || query.isFetchingNextPage) return;
		query.fetchNextPage();
	}

	function reset() {
		setSearch("");
	}

	return {
		...query,
		search,
		updateSearch,
		page,
		products,
		totalPages,
		productsMatched,
		hasMorePages,
		loadMore,
		reset,
	};
}

export async function fetchProductsByCodes(input: TGetProductsByCodesInput) {
	try {
		const urlParams = new URLSearchParams();
		urlParams.set("codes", input.codes.join(","));
		const { data } = await axios.get<TGetProductsByCodesOutput>(`/api/products/by-codes?${urlParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductsByCodes", error);
		throw error;
	}
}

// Products Overall Stats Query
async function fetchProductsOverallStats(input: TGetProductsOverallStatsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		const { data } = await axios.get<TGetProductsOverallStatsOutput>(`/api/products/stats/overall?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductsOverallStats", error);
		throw error;
	}
}

export function useProductsOverallStats(input: TGetProductsOverallStatsInput) {
	return useQuery({
		queryKey: ["products-overall-stats", input],
		queryFn: () => fetchProductsOverallStats(input),
	});
}

// Products Graph Query
async function fetchProductsGraph(input: TGetProductsGraphInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("graphType", input.graphType);
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		const { data } = await axios.get<TGetProductsGraphOutput>(`/api/products/stats/graph?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductsGraph", error);
		throw error;
	}
}

export function useProductsGraph(input: TGetProductsGraphInput) {
	return useQuery({
		queryKey: ["products-graph", input],
		queryFn: () => fetchProductsGraph(input),
	});
}

// Products Ranking Query
async function fetchProductsRanking(input: TGetProductsRankingInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		if (input.comparingPeriodAfter) searchParams.set("comparingPeriodAfter", input.comparingPeriodAfter.toISOString());
		if (input.comparingPeriodBefore) searchParams.set("comparingPeriodBefore", input.comparingPeriodBefore.toISOString());
		if (input.rankingBy) searchParams.set("rankingBy", input.rankingBy);
		const { data } = await axios.get<TGetProductsRankingOutput>(`/api/products/stats/ranking?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductsRanking", error);
		throw error;
	}
}

export function useProductsRanking(input: TGetProductsRankingInput) {
	return useQuery({
		queryKey: ["products-ranking", input],
		queryFn: () => fetchProductsRanking(input),
	});
}

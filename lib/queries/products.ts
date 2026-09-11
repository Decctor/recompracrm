import type { TGetProductsByIdInput, TGetProductsDefaultInput, TGetProductsOutput, TGetProductsOutputStock } from "@/app/api/products/route";
import type { TGetProductVariantsOutput } from "@/app/api/products/variants/route";
import type { TGetProductAddOnsOutput } from "@/app/api/products/add-ons/route";
import type { TGetProductGroupsOutput } from "@/app/api/products/groups/route";
import type { TGetProductFiscalProfilesOutput } from "@/app/api/products/fiscal-profiles/route";
import type { TGetProductsByCodesInput, TGetProductsByCodesOutput } from "@/app/api/products/by-codes/route";
import type { TGetProductGraphInput, TGetProductGraphOutput } from "@/app/api/products/graph/route";
import type { TGetProductsBySearchInput, TGetProductsBySearchOutput } from "@/app/api/products/search/route";
import type { TGetProductStatsInput, TGetProductStatsOutput } from "@/app/api/products/stats/route";
import type { TGetProductsGraphInput, TGetProductsGraphOutput } from "@/app/api/products/stats/graph/route";
import type { TGetProductsOverallStatsInput, TGetProductsOverallStatsOutput } from "@/app/api/products/stats/overall/route";
import type { TGetProductsRankingInput, TGetProductsRankingOutput } from "@/app/api/products/stats/ranking/route";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";
import type { TGetProductsPortfolioAnalysisInput, TGetProductsPortfolioAnalysisOutput } from "@/app/api/products/stats/portfolio-analysis/route";

async function fetchProducts(input: TGetProductsDefaultInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.groups) searchParams.set("groups", input.groups.join(","));
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsIntegrationsIds) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
		if (input.statsExcludedSalesIds) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
		if (input.statsTotalMin) searchParams.set("statsTotalMin", input.statsTotalMin.toString());
		if (input.statsTotalMax) searchParams.set("statsTotalMax", input.statsTotalMax.toString());
		if (input.stockStatus && input.stockStatus.length > 0) searchParams.set("stockStatus", input.stockStatus.join(","));
		if (input.trackedOnly) searchParams.set("trackedOnly", "true");
		if (input.priceMin) searchParams.set("priceMin", input.priceMin.toString());
		if (input.priceMax) searchParams.set("priceMax", input.priceMax.toString());
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		if (input.abcClasses && input.abcClasses.length > 0) searchParams.set("abcClasses", input.abcClasses.join(","));
		if (input.resultLimit) searchParams.set("resultLimit", input.resultLimit.toString());
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
		statsIntegrationsIds: initialFilters?.statsIntegrationsIds || [],
		statsExcludedSalesIds: initialFilters?.statsExcludedSalesIds || [],
		statsTotalMin: initialFilters?.statsTotalMin || null,
		statsTotalMax: initialFilters?.statsTotalMax || null,
		stockStatus: initialFilters?.stockStatus || [],
		trackedOnly: initialFilters?.trackedOnly ?? false,
		priceMin: initialFilters?.priceMin || null,
		priceMax: initialFilters?.priceMax || null,
		abcClasses: initialFilters?.abcClasses || [],
		resultLimit: initialFilters?.resultLimit ?? null,
		orderByField: initialFilters?.orderByField || "nome",
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

// Stock view (mode=stock): visão operacional de estoque por produto.
async function fetchProductsStock(input: TGetProductsDefaultInput): Promise<TGetProductsOutputStock> {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("mode", "stock");
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.groups && input.groups.length > 0) searchParams.set("groups", input.groups.join(","));
		if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
		if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
		if (input.stockStatus && input.stockStatus.length > 0) searchParams.set("stockStatus", input.stockStatus.join(","));
		if (input.trackedOnly) searchParams.set("trackedOnly", "true");
		if (input.priceMin) searchParams.set("priceMin", input.priceMin.toString());
		if (input.priceMax) searchParams.set("priceMax", input.priceMax.toString());
		if (input.orderByField) searchParams.set("orderByField", input.orderByField);
		if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
		const { data } = await axios.get<TGetProductsOutput>(`/api/products?${searchParams.toString()}`);
		const result = data.data.stock;
		if (!result) throw new Error("Visão de estoque não encontrada.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductsStock", error);
		throw error;
	}
}

type UseProductsStockParams = {
	initialFilters?: Partial<TGetProductsDefaultInput>;
	enabled?: boolean;
};
export function useProductsStock({ initialFilters, enabled = true }: UseProductsStockParams = {}) {
	const [filters, setFilters] = useState<TGetProductsDefaultInput>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		groups: initialFilters?.groups || [],
		statsSellerIds: [],
		statsPeriodBefore: initialFilters?.statsPeriodBefore || null,
		statsPeriodAfter: initialFilters?.statsPeriodAfter || null,
		statsIntegrationsIds: [],
		statsExcludedSalesIds: [],
		statsTotalMin: null,
		statsTotalMax: null,
		stockStatus: initialFilters?.stockStatus || [],
		trackedOnly: initialFilters?.trackedOnly ?? false,
		priceMin: initialFilters?.priceMin || null,
		priceMax: initialFilters?.priceMax || null,
		abcClasses: [],
		resultLimit: null,
		orderByField: initialFilters?.orderByField || "nome",
		orderByDirection: initialFilters?.orderByDirection || "asc",
	});
	function updateFilters(newParams: Partial<TGetProductsDefaultInput>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newParams }));
	}

	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["products-stock", debouncedFilters],
			queryFn: () => fetchProductsStock(debouncedFilters),
			enabled,
		}),
		queryKey: ["products-stock", debouncedFilters],
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
		if (input.integrationsIds && input.integrationsIds.length > 0) {
			searchParams.set("integrationsIds", JSON.stringify(input.integrationsIds));
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
	enabled?: boolean;
};
export function useProductStats({ productId, initialFilters, enabled = true }: UseProductStatsParams) {
	const [filters, setFilters] = useState<Omit<TGetProductStatsInput, "productId">>({
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
		sellerId: initialFilters?.sellerId || null,
		partnerId: initialFilters?.partnerId || null,
		integrationsIds: initialFilters?.integrationsIds || null,
	});
	function updateFilters(newFilters: Partial<Omit<TGetProductStatsInput, "productId">>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 1000);
	return {
		...useQuery({
			queryKey: ["product-stats", productId, debouncedFilters],
			queryFn: () => fetchProductStats({ productId, ...debouncedFilters }),
			enabled,
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
		if (input.integrationsIds && input.integrationsIds.length > 0) {
			searchParams.set("integrationsIds", JSON.stringify(input.integrationsIds));
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
	const [searchWasTouched, setSearchWasTouched] = useState(false);
	const debouncedSearch = useDebounceMemo({ search }, 500);

	useEffect(() => {
		if (searchWasTouched) return;
		setSearch(initialSearch);
	}, [initialSearch, searchWasTouched]);

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
		setSearchWasTouched(true);
		setSearch(value);
	}

	function loadMore() {
		if (!hasMorePages || query.isFetchingNextPage) return;
		query.fetchNextPage();
	}

	function reset() {
		setSearchWasTouched(true);
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

async function fetchProductsPortfolioAnalysis(input: TGetProductsPortfolioAnalysisInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
		if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
		const { data } = await axios.get<TGetProductsPortfolioAnalysisOutput>(`/api/products/stats/portfolio-analysis?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchProductsPortfolioAnalysis", error);
		throw error;
	}
}

export function useProductsPortfolioAnalysis(input: TGetProductsPortfolioAnalysisInput) {
	const queryKey = ["products-portfolio-analysis", input.periodAfter?.toISOString() ?? null, input.periodBefore?.toISOString() ?? null] as const;
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductsPortfolioAnalysis(input),
		}),
		queryKey,
	};
}

async function fetchProductVariantsByProductId(productId: string) {
	try {
		const { data } = await axios.get<TGetProductVariantsOutput>(`/api/products/variants?productId=${productId}`);
		const result = data.data.byProductId;
		if (!result) throw new Error("Variantes do produto não encontradas.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductVariantsByProductId", error);
		throw error;
	}
}

async function fetchProductVariantById(productVariantId: string) {
	try {
		const { data } = await axios.get<TGetProductVariantsOutput>(`/api/products/variants?productVariantId=${productVariantId}`);
		const result = data.data.byId;
		if (!result) throw new Error("Variante não encontrada.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductVariantById", error);
		throw error;
	}
}

export function useProductVariantsByProductId({ productId }: { productId: string }) {
	return {
		...useQuery({
			queryKey: ["product-variants-by-product-id", productId],
			queryFn: () => fetchProductVariantsByProductId(productId),
		}),
		queryKey: ["product-variants-by-product-id", productId],
	};
}

export function useProductVariantById({ productVariantId }: { productVariantId: string }) {
	return {
		...useQuery({
			queryKey: ["product-variant-by-id", productVariantId],
			queryFn: () => fetchProductVariantById(productVariantId),
		}),
		queryKey: ["product-variant-by-id", productVariantId],
	};
}

async function fetchProductAddOnsByProductId(productId: string) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productId", productId);
		const { data } = await axios.get<TGetProductAddOnsOutput>(`/api/products/add-ons?${searchParams.toString()}`);
		const result = data.data.byProductId;
		if (!result) throw new Error("Adicionais do produto não encontrados.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductAddOnsByProductId", error);
		throw error;
	}
}

async function fetchProductAddOnById(productAddOnId: string) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productAddOnId", productAddOnId);
		const { data } = await axios.get<TGetProductAddOnsOutput>(`/api/products/add-ons?${searchParams.toString()}`);
		const result = data.data.byId;
		if (!result) throw new Error("Adicional não encontrado.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductAddOnById", error);
		throw error;
	}
}

export function useProductAddOnsByProductId({ productId }: { productId: string }) {
	return {
		...useQuery({
			queryKey: ["product-add-ons-by-product-id", productId],
			queryFn: () => fetchProductAddOnsByProductId(productId),
		}),
		queryKey: ["product-add-ons-by-product-id", productId],
	};
}

export function useProductAddOnById({ productAddOnId }: { productAddOnId: string }) {
	return {
		...useQuery({
			queryKey: ["product-add-on-by-id", productAddOnId],
			queryFn: () => fetchProductAddOnById(productAddOnId),
		}),
		queryKey: ["product-add-on-by-id", productAddOnId],
	};
}

type TProductAddOnsFilters = {
	search: string;
	activeOnly: boolean;
};

async function fetchProductAddOns(filters: TProductAddOnsFilters) {
	try {
		const searchParams = new URLSearchParams();
		if (filters.search) searchParams.set("search", filters.search);
		if (filters.activeOnly) searchParams.set("activeOnly", "true");
		const { data } = await axios.get<TGetProductAddOnsOutput>(`/api/products/add-ons?${searchParams.toString()}`);
		const result = data.data.default;
		if (!result) throw new Error("Grupos de adicionais não encontrados.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductAddOns", error);
		throw error;
	}
}

type UseProductAddOnsParams = {
	initialFilters?: Partial<TProductAddOnsFilters>;
};
export function useProductAddOns({ initialFilters }: UseProductAddOnsParams = {}) {
	const [filters, setFilters] = useState<TProductAddOnsFilters>({
		search: initialFilters?.search || "",
		activeOnly: initialFilters?.activeOnly ?? false,
	});
	function updateFilters(newFilters: Partial<TProductAddOnsFilters>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}

	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["product-add-ons", debouncedFilters],
			queryFn: () => fetchProductAddOns(debouncedFilters),
		}),
		queryKey: ["product-add-ons", debouncedFilters],
		filters,
		updateFilters,
	};
}

async function fetchProductFiscalProfilesByProductId(productId: string) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productId", productId);
		const { data } = await axios.get<TGetProductFiscalProfilesOutput>(`/api/products/fiscal-profiles?${searchParams.toString()}`);
		const result = data.data.byProductId;
		if (!result) throw new Error("Perfis fiscais do produto não encontrados.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductFiscalProfilesByProductId", error);
		throw error;
	}
}

async function fetchProductFiscalProfileById(productFiscalProfileId: string) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("productFiscalProfileId", productFiscalProfileId);
		const { data } = await axios.get<TGetProductFiscalProfilesOutput>(`/api/products/fiscal-profiles?${searchParams.toString()}`);
		const result = data.data.byId;
		if (!result) throw new Error("Perfil fiscal não encontrado.");
		return result;
	} catch (error) {
		console.log("Error running fetchProductFiscalProfileById", error);
		throw error;
	}
}

/**
 * Quais produtos do carrinho nao tem perfil fiscal ativo. Uma query por produto (endpoint
 * existente), cacheada por id; so roda quando `enabled` — o checkout liga isto apenas com a
 * emissao automatica ativa, para avisar antes da nota falhar.
 */
export function useProductsMissingFiscalProfile({ productIds, enabled = true }: { productIds: string[]; enabled?: boolean }) {
	const uniqueIds = [...new Set(productIds)].sort();
	const results = useQueries({
		queries: uniqueIds.map((productId) => ({
			queryKey: ["product-fiscal-profiles-by-product-id", productId],
			queryFn: () => fetchProductFiscalProfilesByProductId(productId),
			enabled,
			staleTime: 60_000,
			retry: false,
		})),
	});
	const missingProductIds = uniqueIds.filter((_, index) => results[index]?.isSuccess && (results[index]?.data?.length ?? 0) === 0);
	return {
		missingProductIds,
		isLoading: results.some((result) => result.isLoading),
	};
}

export function useProductFiscalProfilesByProductId({ productId }: { productId: string }) {
	return {
		...useQuery({
			queryKey: ["product-fiscal-profiles-by-product-id", productId],
			queryFn: () => fetchProductFiscalProfilesByProductId(productId),
		}),
		queryKey: ["product-fiscal-profiles-by-product-id", productId],
	};
}

export function useProductFiscalProfileById({ productFiscalProfileId }: { productFiscalProfileId: string }) {
	return {
		...useQuery({
			queryKey: ["product-fiscal-profile-by-id", productFiscalProfileId],
			queryFn: () => fetchProductFiscalProfileById(productFiscalProfileId),
		}),
		queryKey: ["product-fiscal-profile-by-id", productFiscalProfileId],
	};
}

async function fetchProductGroups() {
	const { data } = await axios.get<TGetProductGroupsOutput>("/api/products/groups");
	return data.data.groups;
}

/**
 * Os grupos que a organização já usa (DISTINCT de `products.grupo`). Muda apenas quando alguém
 * cadastra ou renomeia um grupo, então a lista aguenta um tempo maior de frescor — quem renomeia
 * invalida a chave na hora.
 */
export function useProductGroups() {
	const queryKey = ["product-groups"];
	return {
		...useQuery({ queryKey, queryFn: fetchProductGroups, staleTime: 5 * 60 * 1000 }),
		queryKey,
	};
}

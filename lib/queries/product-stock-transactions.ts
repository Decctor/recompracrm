import type {
	TGetProductStockTransactionsDefaultInput,
	TGetProductStockTransactionsOutput,
} from "@/app/api/products/stock-transactions/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "./../hooks/use-debounce";

async function fetchProductStockTransactions(input: TGetProductStockTransactionsDefaultInput) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.types.length > 0) searchParams.set("types", input.types.join(","));
	if (input.origin) searchParams.set("origin", input.origin);
	if (input.productId) searchParams.set("productId", input.productId);
	if (input.productVariantId) searchParams.set("productVariantId", input.productVariantId);
	if (input.periodAfter) searchParams.set("periodAfter", new Date(input.periodAfter).toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", new Date(input.periodBefore).toISOString());

	const { data } = await axios.get<TGetProductStockTransactionsOutput>(`/api/products/stock-transactions?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Movimentações de estoque não encontradas.");
	return result;
}

type UseProductStockTransactionsParams = {
	initialFilters?: Partial<TGetProductStockTransactionsDefaultInput>;
	enabled?: boolean;
};
export function useProductStockTransactions({ initialFilters, enabled = true }: UseProductStockTransactionsParams = {}) {
	const [filters, setFilters] = useState<TGetProductStockTransactionsDefaultInput>({
		page: initialFilters?.page ?? 1,
		search: initialFilters?.search ?? "",
		types: initialFilters?.types ?? [],
		origin: initialFilters?.origin ?? null,
		productId: initialFilters?.productId ?? null,
		productVariantId: initialFilters?.productVariantId ?? null,
		periodAfter: initialFilters?.periodAfter ?? null,
		periodBefore: initialFilters?.periodBefore ?? null,
	});

	function updateFilters(newFilters: Partial<TGetProductStockTransactionsDefaultInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}

	const debouncedSearch = useDebounceMemo({ search: filters.search }, 800);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["product-stock-transactions", finalFilters];

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductStockTransactions(finalFilters),
			enabled,
		}),
		queryKey,
		filters,
		updateFilters,
	};
}

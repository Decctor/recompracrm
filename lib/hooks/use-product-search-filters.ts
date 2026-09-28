"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeProductSearchTerms } from "@/lib/products/search-terms";

export function useProductSearchFilters<T extends { search: string[]; page: number }>(initialFilters: T) {
	const [{ filters, queryFilters }, setState] = useState({ filters: initialFilters, queryFilters: initialFilters });
	useEffect(() => {
		const timeout = setTimeout(() => setState((state) => ({ ...state, queryFilters: filters })), 300);
		return () => clearTimeout(timeout);
	}, [filters]);
	const updateFilters = useCallback((changes: Partial<T>, immediate = false) => {
		setState((state) => {
			const filters = { ...state.filters, ...changes, page: changes.page ?? 1 };
			return { filters, queryFilters: immediate ? filters : state.queryFilters };
		});
	}, []);
	return { filters, updateFilters, debouncedFilters: { ...queryFilters, search: normalizeProductSearchTerms(queryFilters.search) } };
}

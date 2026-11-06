import type { TGetStatementImportsOutput } from "@/app/api/finances/reconciliation/imports/route";
import type {
	TGetStatementTransactionsOutput,
	TGetStatementTransactionsOutputById,
	TGetStatementTransactionsOutputDefault,
} from "@/app/api/finances/reconciliation/statement-transactions/route";
import axios from "axios";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounceMemo } from "../hooks/use-debounce";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

// ============================================================================
// STATEMENT IMPORTS
// ============================================================================

type StatementImportsFilters = {
	contaFinanceiraId: string;
	page: number;
};

async function fetchStatementImports(filters: StatementImportsFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("contaFinanceiraId", filters.contaFinanceiraId);
	searchParams.set("page", filters.page.toString());
	const { data } = await axios.get<TGetStatementImportsOutput>(`/api/finances/reconciliation/imports?${searchParams.toString()}`);
	return data.data;
}

type UseStatementImportsParams = {
	contaFinanceiraId: string;
};
export function useStatementImports({ contaFinanceiraId }: UseStatementImportsParams) {
	const [params, setParams] = useState<StatementImportsFilters>({
		contaFinanceiraId,
		page: 1,
	});
	function updateParams(newParams: Partial<StatementImportsFilters>) {
		setParams((prev) => ({ ...prev, ...newParams }));
	}
	const finalParams = { ...params, contaFinanceiraId };
	return {
		...useQuery({
			queryKey: ["reconciliation-statement-imports", finalParams],
			queryFn: () => fetchStatementImports(finalParams),
			enabled: !!contaFinanceiraId,
		}),
		queryKey: ["reconciliation-statement-imports", finalParams],
		params: finalParams,
		updateParams,
	};
}

// ============================================================================
// STATEMENT TRANSACTIONS (Linhas do Extrato)
// ============================================================================

export type TStatementTransactionsFilters = {
	contaFinanceiraId: string;
	statuses: string[];
	search: string;
	page: number;
	pageSize: number;
};

async function fetchStatementTransactions(filters: TStatementTransactionsFilters): Promise<TGetStatementTransactionsOutputDefault> {
	const searchParams = new URLSearchParams();
	searchParams.set("contaFinanceiraId", filters.contaFinanceiraId);
	searchParams.set("page", filters.page.toString());
	searchParams.set("pageSize", filters.pageSize.toString());
	if (filters.search) searchParams.set("search", filters.search);
	if (filters.statuses.length > 0) searchParams.set("statuses", filters.statuses.join(","));
	const { data } = await axios.get<TGetStatementTransactionsOutput>(`/api/finances/reconciliation/statement-transactions?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as linhas do extrato.");
	return result;
}

type UseStatementTransactionsParams = {
	contaFinanceiraId: string;
	initialParams?: Partial<Omit<TStatementTransactionsFilters, "contaFinanceiraId">>;
};
export function useStatementTransactions({ contaFinanceiraId, initialParams }: UseStatementTransactionsParams) {
	const [params, setParams] = useState<TStatementTransactionsFilters>({
		contaFinanceiraId,
		statuses: initialParams?.statuses || [],
		search: initialParams?.search || "",
		page: initialParams?.page || 1,
		pageSize: initialParams?.pageSize || DEFAULT_PAGE_SIZE,
	});
	function updateParams(newParams: Partial<TStatementTransactionsFilters>) {
		setParams((prev) => ({ ...prev, ...newParams }));
	}
	const debouncedSearch = useDebounceMemo({ search: params.search }, 500);
	const debouncedParams = { ...params, ...debouncedSearch, contaFinanceiraId };
	return {
		...useQuery({
			queryKey: ["reconciliation-statement-transactions", debouncedParams],
			queryFn: () => fetchStatementTransactions(debouncedParams),
			enabled: !!contaFinanceiraId,
		}),
		queryKey: ["reconciliation-statement-transactions", debouncedParams],
		params,
		updateParams,
		debouncedParams,
	};
}

async function fetchStatementTransactionById(linhaId: string): Promise<TGetStatementTransactionsOutputById> {
	const searchParams = new URLSearchParams();
	searchParams.set("id", linhaId);
	const { data } = await axios.get<TGetStatementTransactionsOutput>(`/api/finances/reconciliation/statement-transactions?${searchParams.toString()}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar a linha do extrato.");
	return result;
}

type UseStatementTransactionByIdParams = {
	linhaId: string;
};
export function useStatementTransactionById({ linhaId }: UseStatementTransactionByIdParams) {
	return {
		...useQuery({
			queryKey: ["reconciliation-statement-transaction-by-id", linhaId],
			queryFn: () => fetchStatementTransactionById(linhaId),
			enabled: !!linhaId,
		}),
		queryKey: ["reconciliation-statement-transaction-by-id", linhaId],
	};
}

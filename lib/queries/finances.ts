import { TGetFinancesOverallStatsInput, TGetFinancesOverallStatsOutput } from "@/app/api/finances/stats/route";
import { TGetAccountingEntriesInput, TGetAccountingEntriesOutput } from "@/app/api/finances/accounting-entries/route";
import { TGetFinancialTransactionsOutput } from "@/app/api/finances/financial-transactions/route";
import { TGetFinancialAccountsOutput, TGetFinancialAccountsOutputById } from "@/app/api/finances/financial-accounts/route";
import { TGetFinancialAccountGraphOutput } from "@/app/api/finances/financial-accounts/graph/route";
import { TGetRecurringRulesOutput } from "@/app/api/finances/recurring-rules/route";
import type { TGetCreditCardInvoicesInput, TGetCreditCardInvoicesOutput } from "@/app/api/finances/credit-card-invoices/route";
import axios from "axios";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useDebounceMemo } from "../hooks/use-debounce";
import type { TGetAccountChartsInputDefault, TGetAccountChartsOutput } from "@/app/api/finances/account-charts/route";

// ============================================================================
// ACCOUNT CHARTS
// ============================================================================

async function getAccountCharts(input: TGetAccountChartsInputDefault) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	const { data } = await axios.get<TGetAccountChartsOutput>(`/api/finances/account-charts?${searchParams.toString()}`);
	const defaultData = data.data.default;
	if (!defaultData) throw new Error("Oops, houve um erro ao buscar as contas contábeis.");
	return defaultData;
}

type UseAccountChartsParams = {
	initialFilters?: Partial<TGetAccountChartsInputDefault>;
};
export function useAccountCharts({ initialFilters }: UseAccountChartsParams) {
	const [filters, setFilters] = useState<TGetAccountChartsInputDefault>({
		search: initialFilters?.search || "",
	});

	function updateFilters(newFilters: Partial<TGetAccountChartsInputDefault>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["finances-account-charts", finalFilters],
			queryFn: () => getAccountCharts(finalFilters),
		}),
		queryKey: ["finances-account-charts", finalFilters],
		filters,
		updateFilters,
	};
}

async function getFinancesOverallStats(input: TGetFinancesOverallStatsInput) {
	const searchParams = new URLSearchParams();
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	const { data } = await axios.get<TGetFinancesOverallStatsOutput>(`/api/finances/stats?${searchParams.toString()}`);
	return data.data;
}

type UseFinancesOverallStatsParams = {
	initialParams: Partial<TGetFinancesOverallStatsInput>;
	enabled?: boolean;
};
export function useFinancesOverallStats({ initialParams, enabled = true }: UseFinancesOverallStatsParams) {
	const monthStart = dayjs().startOf("month").toDate();
	const monthEnd = dayjs().endOf("month").toDate();
	const [params, setParams] = useState<TGetFinancesOverallStatsInput>({
		periodAfter: initialParams.periodAfter || monthStart,
		periodBefore: initialParams.periodBefore || monthEnd,
	});
	function updateParams(newParams: Partial<TGetFinancesOverallStatsInput>) {
		setParams((prev) => ({ ...prev, ...newParams }));
	}
	return {
		...useQuery({
			queryKey: ["finances-overall-stats", params],
			queryFn: () => getFinancesOverallStats(params),
			enabled,
		}),
		queryKey: ["finances-overall-stats", params],
		params,
		updateParams,
	};
}

// ============================================================================
// ACCOUNTING ENTRIES
// ============================================================================

async function fetchAccountingEntries(filters: TGetAccountingEntriesInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", filters.page.toString());
	if (filters.search) searchParams.set("search", filters.search);
	if (filters.periodAfter) searchParams.set("periodAfter", filters.periodAfter.toISOString());
	if (filters.periodBefore) searchParams.set("periodBefore", filters.periodBefore.toISOString());
	if (filters.originTypes && filters.originTypes.length > 0) searchParams.set("originTypes", filters.originTypes.join(","));
	if (filters.transactionStatuses && filters.transactionStatuses.length > 0)
		searchParams.set("transactionStatuses", filters.transactionStatuses.join(","));
	searchParams.set("sortOrder", filters.sortOrder);
	const { data } = await axios.get<TGetAccountingEntriesOutput>(`/api/finances/accounting-entries?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar os lançamentos.");
	return result;
}

async function fetchAccountingEntryById(entryId: string) {
	const searchParams = new URLSearchParams();
	searchParams.set("id", entryId);
	const { data } = await axios.get<TGetAccountingEntriesOutput>(`/api/finances/accounting-entries?${searchParams.toString()}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar o lançamento.");
	return result;
}

export function useAccountingEntryById(entryId: string) {
	return {
		...useQuery({
			queryKey: ["finances-accounting-entry-by-id", entryId],
			queryFn: () => fetchAccountingEntryById(entryId),
			enabled: !!entryId,
		}),
		queryKey: ["finances-accounting-entry-by-id", entryId],
	};
}

type UseFinancesAccountingEntriesParams = {
	initialFilters?: Partial<TGetAccountingEntriesInput>;
};
export function useFinancesAccountingEntries({ initialFilters }: UseFinancesAccountingEntriesParams) {
	const [filters, setFilters] = useState<TGetAccountingEntriesInput>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
		originTypes: initialFilters?.originTypes || [],
		transactionStatuses: initialFilters?.transactionStatuses || [],
		sortOrder: initialFilters?.sortOrder || "desc",
	});
	function updateFilters(newFilters: Partial<TGetAccountingEntriesInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["finances-accounting-entries", finalFilters],
			queryFn: () => fetchAccountingEntries(finalFilters),
		}),
		queryKey: ["finances-accounting-entries", finalFilters],
		filters,
		updateFilters,
	};
}

// ============================================================================
// FINANCIAL TRANSACTIONS
// ============================================================================

async function fetchFinancialTransactionById(id: string) {
	const { data } = await axios.get<TGetFinancialTransactionsOutput>(`/api/finances/financial-transactions?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar a transação financeira.");
	return result;
}

export function useFinancialTransactionById(id: string) {
	return {
		...useQuery({
			queryKey: ["finances-financial-transaction-by-id", id],
			queryFn: () => fetchFinancialTransactionById(id),
		}),
		queryKey: ["finances-financial-transaction-by-id", id],
	};
}

type FinancialTransactionsFilters = {
	page: number;
	search: string;
	periodAfter: Date | null;
	periodBefore: Date | null;
	types: string[];
	paymentMethods: string[];
	statuses: string[];
};

async function fetchFinancialTransactions(filters: FinancialTransactionsFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", filters.page.toString());
	if (filters.search) searchParams.set("search", filters.search);
	if (filters.periodAfter) searchParams.set("periodAfter", filters.periodAfter.toISOString());
	if (filters.periodBefore) searchParams.set("periodBefore", filters.periodBefore.toISOString());
	if (filters.types.length > 0) searchParams.set("types", filters.types.join(","));
	if (filters.paymentMethods.length > 0) searchParams.set("paymentMethods", filters.paymentMethods.join(","));
	if (filters.statuses.length > 0) searchParams.set("statuses", filters.statuses.join(","));
	const { data } = await axios.get<TGetFinancialTransactionsOutput>(`/api/finances/financial-transactions?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as movimentações.");
	return result;
}

type UseFinancesTransactionsParams = {
	initialFilters?: Partial<FinancialTransactionsFilters>;
};
export function useFinancesTransactions({ initialFilters }: UseFinancesTransactionsParams) {
	const [filters, setFilters] = useState<FinancialTransactionsFilters>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		periodAfter: initialFilters?.periodAfter || null,
		periodBefore: initialFilters?.periodBefore || null,
		types: initialFilters?.types || [],
		paymentMethods: initialFilters?.paymentMethods || [],
		statuses: initialFilters?.statuses || [],
	});
	function updateFilters(newFilters: Partial<FinancialTransactionsFilters>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["finances-financial-transactions", finalFilters],
			queryFn: () => fetchFinancialTransactions(finalFilters),
		}),
		queryKey: ["finances-financial-transactions", finalFilters],
		filters,
		updateFilters,
	};
}

// ============================================================================
// FINANCIAL ACCOUNTS
// ============================================================================

type FinancialAccountsFilters = {
	activeOnly: boolean;
	stats: boolean;
	statsPeriodAfter: Date | null;
	statsPeriodBefore: Date | null;
};

async function fetchFinancialAccounts(filters: FinancialAccountsFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("activeOnly", filters.activeOnly ? "true" : "false");
	searchParams.set("stats", filters.stats ? "true" : "false");
	if (filters.statsPeriodAfter) searchParams.set("statsPeriodAfter", filters.statsPeriodAfter.toISOString());
	if (filters.statsPeriodBefore) searchParams.set("statsPeriodBefore", filters.statsPeriodBefore.toISOString());
	const { data } = await axios.get<TGetFinancialAccountsOutput>(`/api/finances/financial-accounts?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as contas financeiras.");
	return result;
}

type UseFinancesAccountsParams = {
	initialFilters?: Partial<FinancialAccountsFilters>;
};
export function useFinancesAccounts({ initialFilters }: UseFinancesAccountsParams) {
	const monthStart = dayjs().startOf("month").toDate();
	const monthEnd = dayjs().endOf("month").toDate();
	const [filters, setFilters] = useState<FinancialAccountsFilters>({
		activeOnly: initialFilters?.activeOnly ?? true,
		stats: initialFilters?.stats ?? true,
		statsPeriodAfter: initialFilters?.statsPeriodAfter ?? monthStart,
		statsPeriodBefore: initialFilters?.statsPeriodBefore ?? monthEnd,
	});
	function updateFilters(newFilters: Partial<FinancialAccountsFilters>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	return {
		...useQuery({
			queryKey: ["finances-financial-accounts", filters],
			queryFn: () => fetchFinancialAccounts(filters),
			staleTime: filters.stats ? 60_000 : 5 * 60_000,
		}),
		queryKey: ["finances-financial-accounts", filters],
		filters,
		updateFilters,
	};
}

async function fetchFinancialAccountById(accountId: string) {
	const searchParams = new URLSearchParams({ id: accountId });
	const { data } = await axios.get<TGetFinancialAccountsOutput>(`/api/finances/financial-accounts?${searchParams.toString()}`);
	const account = data.data.byId;
	if (!account) throw new Error("Oops, houve um erro ao buscar a conta financeira.");
	return account as TGetFinancialAccountsOutputById;
}

export function useFinancialAccountById(accountId: string) {
	return {
		...useQuery({
			queryKey: ["finances-financial-account-by-id", accountId],
			queryFn: () => fetchFinancialAccountById(accountId),
			enabled: !!accountId,
		}),
		queryKey: ["finances-financial-account-by-id", accountId],
	};
}

// ============================================================================
// FINANCIAL ACCOUNT GRAPH
// ============================================================================

type FinancialAccountGraphFilters = {
	contaFinanceiraId: string;
	startDate: Date | null;
	endDate: Date | null;
	comparingStartDate?: Date | null;
	comparingEndDate?: Date | null;
};

async function fetchFinancialAccountGraph(filters: FinancialAccountGraphFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("contaFinanceiraId", filters.contaFinanceiraId);
	if (filters.startDate) searchParams.set("startDate", filters.startDate.toISOString());
	if (filters.endDate) searchParams.set("endDate", filters.endDate.toISOString());
	if (filters.comparingStartDate) searchParams.set("comparingStartDate", filters.comparingStartDate.toISOString());
	if (filters.comparingEndDate) searchParams.set("comparingEndDate", filters.comparingEndDate.toISOString());
	const { data } = await axios.get<TGetFinancialAccountGraphOutput>(`/api/finances/financial-accounts/graph?${searchParams.toString()}`);
	return data.data;
}

type UseFinancialAccountGraphParams = {
	contaFinanceiraId: string;
	startDate: Date | null;
	endDate: Date | null;
};
export function useFinancialAccountGraph({ contaFinanceiraId, startDate, endDate }: UseFinancialAccountGraphParams) {
	return useQuery({
		queryKey: ["financial-account-graph", contaFinanceiraId, startDate, endDate],
		queryFn: () => fetchFinancialAccountGraph({ contaFinanceiraId, startDate, endDate }),
		enabled: !!contaFinanceiraId,
	});
}

async function fetchFinancialRecurringRules(ruleId?: string | null) {
	const searchParams = new URLSearchParams();
	if (ruleId) searchParams.set("id", ruleId);
	const { data } = await axios.get<TGetRecurringRulesOutput>(`/api/finances/recurring-rules?${searchParams.toString()}`);
	return data.data;
}

export function useFinancialRecurringRules(ruleId?: string | null) {
	return {
		...useQuery({
			queryKey: ["finances-recurring-rules", ruleId ?? "list"],
			queryFn: () => fetchFinancialRecurringRules(ruleId),
		}),
		queryKey: ["finances-recurring-rules", ruleId ?? "list"],
	};
}

// ============================================================================
// CREDIT CARD INVOICES (derived read model)
// ============================================================================

async function fetchCreditCardInvoices(input: TGetCreditCardInvoicesInput) {
	const searchParams = new URLSearchParams();
	if (input.contaFinanceiraId) searchParams.set("contaFinanceiraId", input.contaFinanceiraId);
	if (input.dataVencimento) searchParams.set("dataVencimento", input.dataVencimento.toISOString());
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	const { data } = await axios.get<TGetCreditCardInvoicesOutput>(`/api/finances/credit-card-invoices?${searchParams.toString()}`);
	return data.data;
}

export function useCreditCardInvoices(input: TGetCreditCardInvoicesInput = {}) {
	return {
		...useQuery({
			queryKey: ["finances-credit-card-invoices", input],
			queryFn: () => fetchCreditCardInvoices(input),
		}),
		queryKey: ["finances-credit-card-invoices", input],
	};
}

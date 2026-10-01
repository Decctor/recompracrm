import type { TGetCashbackBalancesInput, TGetCashbackBalancesOutput } from "@/app/api/cashback-programs/clients/balance/route";
import type { TGetCashbackProgramPrizesOutput } from "@/app/api/cashback-programs/prizes/route";
import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import type { TGetAvailablePosRewardsOutput } from "@/app/api/pos/cashback-rewards/available/route";
import type { TCashbackProgramsGraphInput, TCashbackProgramsGraphOutput } from "@/app/api/cashback-programs/stats/graph/route";
import type { TCashbackProgramStatsOutput } from "@/app/api/cashback-programs/stats/route";
import type { TGetCashbackProgramTransactionsInput, TGetCashbackProgramTransactionsOutput } from "@/app/api/cashback-programs/transactions/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDebounceMemo } from "../hooks/use-debounce";
import { useState } from "react";

async function fetchCashbackProgram() {
	try {
		const { data } = await axios.get<TGetCashbackProgramOutput>("/api/cashback-programs");
		return data.data;
	} catch (error) {
		console.log("Error running fetchCashbackProgram", error);
		throw error;
	}
}

/** `initialData` vem da página servidora: a primeira pintura não espera a consulta. */
export function useCashbackProgram({ initialData }: { initialData?: TGetCashbackProgramOutput["data"] } = {}) {
	return {
		...useQuery({
			queryKey: ["cashback-program"],
			queryFn: fetchCashbackProgram,
			initialData,
		}),
		queryKey: ["cashback-program"],
	};
}

async function fetchCashbackProgramStats(period: { after: string; before: string }) {
	try {
		const { data } = await axios.post<TCashbackProgramStatsOutput>("/api/cashback-programs/stats", { period });
		return data.data;
	} catch (error) {
		console.log("Error running fetchCashbackProgramStats", error);
		throw error;
	}
}

export function useCashbackProgramStats(period: { after: string; before: string }) {
	return {
		...useQuery({
			queryKey: ["cashback-program-stats", period],
			queryFn: () => fetchCashbackProgramStats(period),
			enabled: !!period.after && !!period.before,
		}),
		queryKey: ["cashback-program-stats", period],
	};
}

function buildCashbackTransactionsSearchParams(input: TGetCashbackProgramTransactionsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", input.page.toString());
	searchParams.set("limit", input.limit.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.clientId) searchParams.set("clientId", input.clientId);
	if (input.operatorSellerIds.length > 0) searchParams.set("operatorSellerIds", input.operatorSellerIds.join(","));
	if (input.types.length > 0) searchParams.set("types", input.types.join(","));
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	return searchParams;
}

async function fetchCashbackProgramTransactionsByClientId(input: TGetCashbackProgramTransactionsInput) {
	const searchParams = buildCashbackTransactionsSearchParams(input);
	const { data } = await axios.get<TGetCashbackProgramTransactionsOutput>(`/api/cashback-programs/transactions?${searchParams.toString()}`);
	if (!data.data.byClientId) throw new Error("Transações não encontradas.");
	return data.data.byClientId;
}

export function useCashbackProgramTransactionsByClientId(input: TGetCashbackProgramTransactionsInput) {
	return {
		...useQuery({
			queryKey: ["cashback-program-transactions-by-client-id", input],
			queryFn: () => fetchCashbackProgramTransactionsByClientId(input),
		}),
		queryKey: ["cashback-program-transactions-by-client-id", input],
	};
}

async function fetchCashbackProgramTransactions(input: Omit<TGetCashbackProgramTransactionsInput, "clientId">) {
	const searchParams = buildCashbackTransactionsSearchParams({ ...input, clientId: null });
	const { data } = await axios.get<TGetCashbackProgramTransactionsOutput>(`/api/cashback-programs/transactions?${searchParams.toString()}`);
	if (!data.data.default) throw new Error("Transações não encontradas.");
	return data.data.default;
}

type TUseCashbackProgramTransactionsParams = {
	initialFilters?: Partial<Omit<TGetCashbackProgramTransactionsInput, "clientId">>;
};

export function useCashbackProgramTransactions({ initialFilters }: TUseCashbackProgramTransactionsParams = {}) {
	const [filters, setFilters] = useState<Omit<TGetCashbackProgramTransactionsInput, "clientId">>({
		page: initialFilters?.page ?? 1,
		limit: initialFilters?.limit ?? 20,
		search: initialFilters?.search ?? "",
		operatorSellerIds: initialFilters?.operatorSellerIds ?? [],
		types: initialFilters?.types ?? [],
		periodAfter: initialFilters?.periodAfter ?? null,
		periodBefore: initialFilters?.periodBefore ?? null,
	});
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["cashback-program-transactions", finalFilters];

	function updateFilters(newFilters: Partial<Omit<TGetCashbackProgramTransactionsInput, "clientId">>) {
		setFilters((currentFilters) => ({ ...currentFilters, ...newFilters }));
	}

	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchCashbackProgramTransactions(finalFilters),
		}),
		queryKey,
		filters,
		updateFilters,
	};
}

async function fetchCashbackProgramsGraph(params: TCashbackProgramsGraphInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("graphType", params.graphType);
	if (params.periodAfter) searchParams.set("periodAfter", params.periodAfter.toISOString());
	if (params.periodBefore) searchParams.set("periodBefore", params.periodBefore.toISOString());
	const { data } = await axios.get<TCashbackProgramsGraphOutput>(`/api/cashback-programs/stats/graph?${searchParams.toString()}`);
	return data.data;
}

export function useCashbackProgramsGraph(params: TCashbackProgramsGraphInput) {
	return {
		...useQuery({
			queryKey: ["cashback-programs-graph", params],
			queryFn: () => fetchCashbackProgramsGraph(params),
		}),
		queryKey: ["cashback-programs-graph", params],
	};
}

export async function fetchClientCashbackBalance(clienteId: string) {
	const searchParams = new URLSearchParams();
	searchParams.set("clientId", clienteId);
	const { data } = await axios.get<TGetCashbackBalancesOutput>(`/api/cashback-programs/clients/balance?${searchParams.toString()}`);
	if (!data.data.byClientId) throw new Error("Saldo de cashback não encontrado.");
	return data.data.byClientId;
}

export function useClientCashbackBalance({ clienteId }: { clienteId: string | null | undefined }) {
	const queryKey = ["client-cashback-balance", clienteId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchClientCashbackBalance(clienteId as string),
			enabled: !!clienteId,
		}),
		queryKey,
	};
}

async function fetchCashbackBalances(input: Omit<TGetCashbackBalancesInput, "clientId">) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", input.page.toString());
	searchParams.set("limit", input.limit.toString());
	if (input.search) searchParams.set("search", input.search);
	searchParams.set("orderByField", input.orderByField);
	searchParams.set("orderByDirection", input.orderByDirection);
	const { data } = await axios.get<TGetCashbackBalancesOutput>(`/api/cashback-programs/clients/balance?${searchParams.toString()}`);
	if (!data.data.default) throw new Error("Saldos de cashback não encontrados.");
	return data.data.default;
}

type TUseCashbackBalancesParams = {
	initialFilters?: Partial<Omit<TGetCashbackBalancesInput, "clientId">>;
};

export function useCashbackBalances({ initialFilters }: TUseCashbackBalancesParams = {}) {
	const [filters, setFilters] = useState<Omit<TGetCashbackBalancesInput, "clientId">>({
		page: initialFilters?.page ?? 1,
		limit: initialFilters?.limit ?? 20,
		search: initialFilters?.search ?? "",
		orderByField: initialFilters?.orderByField ?? "saldoValorDisponivel",
		orderByDirection: initialFilters?.orderByDirection ?? "desc",
	});
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["cashback-balances", finalFilters];

	function updateFilters(newFilters: Partial<Omit<TGetCashbackBalancesInput, "clientId">>) {
		setFilters((currentFilters) => ({ ...currentFilters, ...newFilters }));
	}

	return {
		...useQuery({ queryKey, queryFn: () => fetchCashbackBalances(finalFilters) }),
		queryKey,
		filters,
		updateFilters,
	};
}

/**
 *
 * PRIZES
 */
async function fetchCashbackProgramPrizes(programId: string) {
	const searchParams = new URLSearchParams({ programId });
	const { data } = await axios.get<TGetCashbackProgramPrizesOutput>(`/api/cashback-programs/prizes?${searchParams.toString()}`);
	const defaultData = data.data.default;
	if (!defaultData) throw new Error("Prêmios do programa de cashback não encontrados.");
	return defaultData;
}

/**
 * Todas as recompensas do programa, arquivadas inclusive, com a contagem de resgates. Sem filtros
 * no servidor: a tela de gestão busca, filtra por status e ordena localmente.
 */
export function useCashbackProgramPrizes({ programId }: { programId: string }) {
	const queryKey = ["cashback-program-prizes", programId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchCashbackProgramPrizes(programId),
		}),
		queryKey,
	};
}

async function fetchCashbackProgramPrizeById(id: string) {
	const { data } = await axios.get<TGetCashbackProgramPrizesOutput>(`/api/cashback-programs/prizes?id=${id}`);
	const byIdData = data.data.byId;
	if (!byIdData) throw new Error("Prêmio do programa de cashback não encontrado.");
	return byIdData;
}

export function useCashbackProgramPrizeById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["cashback-program-prize-by-id", id],
			queryFn: () => fetchCashbackProgramPrizeById(id),
		}),
		queryKey: ["cashback-program-prize-by-id", id],
	};
}

async function fetchPosAvailableRewards(clienteId: string) {
	const searchParams = new URLSearchParams();
	searchParams.set("clienteId", clienteId);
	const { data } = await axios.get<TGetAvailablePosRewardsOutput>(`/api/pos/cashback-rewards/available?${searchParams.toString()}`);
	return data.data;
}

/**
 * Recompensas (prêmios) resgatáveis pelo cliente vinculado no PDV: prêmios ativos do programa
 * com elegibilidade computada contra o saldo do cliente (`elegivel`/`motivo`).
 */
export function usePosAvailableRewards({ clienteId }: { clienteId: string | null | undefined }) {
	const queryKey = ["pos-available-rewards", clienteId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchPosAvailableRewards(clienteId as string),
			enabled: !!clienteId,
		}),
		queryKey,
	};
}
export type TPosAvailableReward = Awaited<ReturnType<typeof fetchPosAvailableRewards>>["rewards"][number];

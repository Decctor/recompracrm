import type { TGetClientCashbackBalanceOutput } from "@/app/api/cashback-programs/clients/balance/route";
import type { TTopCashbackClientsInput, TTopCashbackClientsOutput } from "@/app/api/cashback-programs/clients/top/route";
import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import type { TCashbackProgramsGraphInput, TCashbackProgramsGraphOutput } from "@/app/api/cashback-programs/stats/graph/route";
import type { TCashbackProgramStatsInput, TCashbackProgramStatsOutput } from "@/app/api/cashback-programs/stats/route";
import type { TCashbackProgramTransactionsInput, TCashbackProgramTransactionsOutput } from "@/app/api/cashback-programs/transactions/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchCashbackProgram() {
	try {
		const { data } = await axios.get<TGetCashbackProgramOutput>("/api/cashback-programs");
		return data.data;
	} catch (error) {
		console.log("Error running fetchCashbackProgram", error);
		throw error;
	}
}

export function useCashbackProgram() {
	return {
		...useQuery({
			queryKey: ["cashback-program"],
			queryFn: fetchCashbackProgram,
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

async function fetchCashbackProgramTransactions(params: TCashbackProgramTransactionsInput) {
	try {
		const { data } = await axios.post<TCashbackProgramTransactionsOutput>("/api/cashback-programs/transactions", params);
		const result = params.clientId ? data.data.byClientId : data.data.default;
		if (!result) throw new Error("Transações não encontradas.");
		return result;
	} catch (error) {
		console.log("Error running fetchCashbackProgramTransactions", error);
		throw error;
	}
}

export function useCashbackProgramTransactions(params: TCashbackProgramTransactionsInput) {
	return {
		...useQuery({
			queryKey: ["cashback-program-transactions", params],
			queryFn: () => fetchCashbackProgramTransactions(params),
		}),
		queryKey: ["cashback-program-transactions", params],
	};
}

async function fetchTopCashbackClients(params: TTopCashbackClientsInput) {
	try {
		const { data } = await axios.post<TTopCashbackClientsOutput>("/api/cashback-programs/clients/top", params);
		return data.data.clients;
	} catch (error) {
		console.log("Error running fetchTopCashbackClients", error);
		throw error;
	}
}

export function useTopCashbackClients(params: TTopCashbackClientsInput) {
	return {
		...useQuery({
			queryKey: ["cashback-program-top-clients", params],
			queryFn: () => fetchTopCashbackClients(params),
		}),
		queryKey: ["cashback-program-top-clients", params],
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
	searchParams.set("clienteId", clienteId);
	const { data } = await axios.get<TGetClientCashbackBalanceOutput>(`/api/cashback-programs/clients/balance?${searchParams.toString()}`);
	return data.data;
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

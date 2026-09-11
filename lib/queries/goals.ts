import type { TGetGoalsByIdInput, TGetGoalsOutput, TGetGoalsOutputDefault } from "@/app/api/goals/route";
import type { TGetGoalsStatsOutput } from "@/app/api/goals/stats/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchGoals({ page = 1 }: { page?: number }) {
	const { data } = await axios.get<TGetGoalsOutput>(`/api/goals?page=${page}`);
	if (!data.data.default) throw new Error("Não foi possível buscar as metas.");
	return data.data.default;
}
async function fetchGoalById(input: TGetGoalsByIdInput) {
	const { data } = await axios.get<TGetGoalsOutput>(`/api/goals?id=${input.id}`);
	if (!data.data.byId) throw new Error("Não foi possível buscar a meta.");
	return data.data.byId;
}
async function fetchGoalsStats() {
	const { data } = await axios.get<TGetGoalsStatsOutput>("/api/goals/stats");
	return data.data;
}

export function useGoals({ page = 1 }: { page?: number } = {}) {
	const queryKey = ["goals", page];
	return {
		...useQuery({
			queryKey,
			queryFn: async () => await fetchGoals({ page }),
		}),
		queryKey,
	};
}

export function useGoalById({ id }: TGetGoalsByIdInput) {
	return {
		...useQuery({
			queryKey: ["goal-by-id", id],
			queryFn: async () => await fetchGoalById({ id }),
		}),
		queryKey: ["goal-by-id", id],
	};
}

export function useGoalsStats({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: ["goals-stats"],
			queryFn: async () => await fetchGoalsStats(),
			enabled,
		}),
		queryKey: ["goals-stats"],
	};
}

export type TUseGoalsDefaultData = TGetGoalsOutputDefault;

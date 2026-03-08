import type { TGetCampaignFlowsInput, TGetCampaignFlowsOutput } from "@/app/api/campaign-flows/route";
import type { TGetCampaignFlowExecutionsInput, TGetCampaignFlowExecutionsOutput } from "@/app/api/campaign-flows/executions/route";
import type { TGetCampaignFlowExecutionStepsInput, TGetCampaignFlowExecutionStepsOutput } from "@/app/api/campaign-flows/executions/steps/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

// ============================================================================
// CAMPAIGN FLOWS — LIST
// ============================================================================

async function fetchCampaignFlows(input: Omit<TGetCampaignFlowsInput, "id">) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.status && input.status.length > 0) searchParams.set("status", input.status.join(","));
		if (input.tipo && input.tipo.length > 0) searchParams.set("tipo", input.tipo.join(","));
		if (input.page) searchParams.set("page", input.page.toString());
		const { data } = await axios.get<TGetCampaignFlowsOutput>(`/api/campaign-flows?${searchParams.toString()}`);
		if (!data.data.default) throw new Error("Fluxos de campanha não encontrados.");
		return data.data.default;
	} catch (error) {
		console.log("Error running fetchCampaignFlows", error);
		throw error;
	}
}

type UseCampaignFlowsParams = {
	initialFilters: Omit<TGetCampaignFlowsInput, "id">;
};
export function useCampaignFlows({ initialFilters }: UseCampaignFlowsParams) {
	const [filters, setFilters] = useState<Omit<TGetCampaignFlowsInput, "id">>(initialFilters);
	function updateFilters(newFilters: Partial<Omit<TGetCampaignFlowsInput, "id">>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["campaign-flows", debouncedFilters],
			queryFn: async () => await fetchCampaignFlows(debouncedFilters),
		}),
		queryKey: ["campaign-flows", debouncedFilters] as const,
		filters,
		updateFilters,
	};
}

// ============================================================================
// CAMPAIGN FLOW — BY ID
// ============================================================================

async function fetchCampaignFlowById(id: string) {
	try {
		const { data } = await axios.get<TGetCampaignFlowsOutput>(`/api/campaign-flows?id=${id}`);
		if (!data.data.byId) throw new Error("Fluxo de campanha não encontrado.");
		return data.data.byId;
	} catch (error) {
		console.log("Error running fetchCampaignFlowById", error);
		throw error;
	}
}

export function useCampaignFlowById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["campaign-flow-by-id", id],
			queryFn: async () => await fetchCampaignFlowById(id),
		}),
		queryKey: ["campaign-flow-by-id", id] as const,
	};
}

// ============================================================================
// CAMPAIGN FLOW EXECUTIONS
// ============================================================================

async function fetchCampaignFlowExecutions(input: TGetCampaignFlowExecutionsInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("campanhaId", input.campanhaId);
		if (input.status && input.status.length > 0) searchParams.set("status", input.status.join(","));
		if (input.page) searchParams.set("page", input.page.toString());
		const { data } = await axios.get<TGetCampaignFlowExecutionsOutput>(`/api/campaign-flows/executions?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignFlowExecutions", error);
		throw error;
	}
}

type UseCampaignFlowExecutionsParams = {
	initialFilters: TGetCampaignFlowExecutionsInput;
};
export function useCampaignFlowExecutions({ initialFilters }: UseCampaignFlowExecutionsParams) {
	const [filters, setFilters] = useState<TGetCampaignFlowExecutionsInput>(initialFilters);
	function updateFilters(newFilters: Partial<TGetCampaignFlowExecutionsInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	return {
		...useQuery({
			queryKey: ["campaign-flow-executions", filters],
			queryFn: async () => await fetchCampaignFlowExecutions(filters),
		}),
		queryKey: ["campaign-flow-executions", filters] as const,
		filters,
		updateFilters,
	};
}

// ============================================================================
// CAMPAIGN FLOW EXECUTION STEPS
// ============================================================================

async function fetchCampaignFlowExecutionSteps(input: TGetCampaignFlowExecutionStepsInput) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("execucaoId", input.execucaoId);
		if (input.page) searchParams.set("page", input.page.toString());
		const { data } = await axios.get<TGetCampaignFlowExecutionStepsOutput>(`/api/campaign-flows/executions/steps?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchCampaignFlowExecutionSteps", error);
		throw error;
	}
}

type UseCampaignFlowExecutionStepsParams = {
	initialFilters: TGetCampaignFlowExecutionStepsInput;
};
export function useCampaignFlowExecutionSteps({ initialFilters }: UseCampaignFlowExecutionStepsParams) {
	const [filters, setFilters] = useState<TGetCampaignFlowExecutionStepsInput>(initialFilters);
	function updateFilters(newFilters: Partial<TGetCampaignFlowExecutionStepsInput>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	return {
		...useQuery({
			queryKey: ["campaign-flow-execution-steps", filters],
			queryFn: async () => await fetchCampaignFlowExecutionSteps(filters),
		}),
		queryKey: ["campaign-flow-execution-steps", filters] as const,
		filters,
		updateFilters,
	};
}

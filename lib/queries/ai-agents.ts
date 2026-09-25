import type { TGetAiAgentModelsOutput } from "@/app/api/ai-agents/models/route";
import type { TGetAiAgentOutput } from "@/app/api/ai-agents/route";
import type { TGetPlaygroundOutput } from "@/app/api/ai-agents/playground/route";
import type { TGetAiAgentRunsOutput } from "@/app/api/ai-agents/runs/route";
import type { TGetAiAgentSpendOutput } from "@/app/api/ai-agents/spend/route";
import type { TAiAgentRunTriggerEnum, TAiAgentRunStatusEnum } from "@/schemas/enums";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// ============================================================================
// AGENTE
// ============================================================================

async function fetchOrganizationAiAgent() {
	const { data } = await axios.get<TGetAiAgentOutput>("/api/ai-agents");
	return data.data;
}

export const AI_AGENT_QUERY_KEY = ["ai-agent"] as const;

/** O GET provisiona o agente no primeiro acesso — não existe estado "sem agente" na UI. */
export function useOrganizationAiAgent({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({ queryKey: AI_AGENT_QUERY_KEY, queryFn: fetchOrganizationAiAgent, enabled }),
		queryKey: AI_AGENT_QUERY_KEY,
	};
}

// ============================================================================
// MODELOS
// ============================================================================

async function fetchAiAgentModels() {
	const { data } = await axios.get<TGetAiAgentModelsOutput>("/api/ai-agents/models");
	return data.data;
}

export const AI_AGENT_MODELS_QUERY_KEY = ["ai-agent-models"] as const;

/** Catálogo curado + preços correntes do AI Gateway. Muda pouco: cache longo. */
export function useAiAgentModels({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({ queryKey: AI_AGENT_MODELS_QUERY_KEY, queryFn: fetchAiAgentModels, enabled, staleTime: 1000 * 60 * 60 }),
		queryKey: AI_AGENT_MODELS_QUERY_KEY,
	};
}

// ============================================================================
// EXECUÇÕES
// ============================================================================

export type TAiAgentRunsFilters = {
	page: number;
	gatilho: TAiAgentRunTriggerEnum | null;
	status: TAiAgentRunStatusEnum | null;
};

async function fetchAiAgentRuns(filters: TAiAgentRunsFilters) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", String(filters.page));
	if (filters.gatilho) searchParams.set("gatilho", filters.gatilho);
	if (filters.status) searchParams.set("status", filters.status);

	const { data } = await axios.get<TGetAiAgentRunsOutput>(`/api/ai-agents/runs?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Não foi possível carregar as execuções do agente.");
	return result;
}

export function getAiAgentRunsQueryKey(filters: TAiAgentRunsFilters) {
	return ["ai-agent-runs", filters.page, filters.gatilho, filters.status] as const;
}

export function useAiAgentRuns({ filters, enabled = true }: { filters: TAiAgentRunsFilters; enabled?: boolean }) {
	const queryKey = getAiAgentRunsQueryKey(filters);
	return {
		...useQuery({ queryKey, queryFn: () => fetchAiAgentRuns(filters), enabled }),
		queryKey,
	};
}

async function fetchAiAgentRunById(runId: string) {
	const { data } = await axios.get<TGetAiAgentRunsOutput>(`/api/ai-agents/runs?id=${runId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Execução não encontrada.");
	return result;
}

export function useAiAgentRunById({ runId, enabled = true }: { runId: string | null; enabled?: boolean }) {
	const queryKey = ["ai-agent-run-by-id", runId] as const;
	return {
		...useQuery({ queryKey, queryFn: () => fetchAiAgentRunById(runId as string), enabled: enabled && !!runId }),
		queryKey,
	};
}

// ============================================================================
// GASTO
// ============================================================================

async function fetchAiAgentSpend() {
	const { data } = await axios.get<TGetAiAgentSpendOutput>("/api/ai-agents/spend");
	return data.data;
}

export const AI_AGENT_SPEND_QUERY_KEY = ["ai-agent-spend"] as const;

/** Gasto estimado do mês e limite. Muda a cada run; a lista de execuções o invalida ao recarregar. */
export function useAiAgentSpend({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({ queryKey: AI_AGENT_SPEND_QUERY_KEY, queryFn: fetchAiAgentSpend, enabled, staleTime: 1000 * 60 }),
		queryKey: AI_AGENT_SPEND_QUERY_KEY,
	};
}

// ============================================================================
// PLAYGROUND
// ============================================================================

async function fetchPlaygroundState() {
	const { data } = await axios.get<TGetPlaygroundOutput>("/api/ai-agents/playground");
	return data.data;
}

export const AI_AGENT_PLAYGROUND_QUERY_KEY = ["ai-agent-playground"] as const;

/**
 * Enquanto uma execução está aberta a UI faz polling: o turno roda dentro do POST da
 * mensagem, mas o polling cobre recarga de página e abas simultâneas.
 */
export function usePlaygroundState({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: AI_AGENT_PLAYGROUND_QUERY_KEY,
			queryFn: fetchPlaygroundState,
			enabled,
			refetchInterval: (query) => (query.state.data?.estado?.execucaoAtiva ? 1500 : false),
		}),
		queryKey: AI_AGENT_PLAYGROUND_QUERY_KEY,
	};
}

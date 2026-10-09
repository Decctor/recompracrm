import type { TAiAgentModelConfig } from "@/schemas/ai-agents";
import { AI_AGENT_MODEL_CATALOG } from "./model-catalog";
import { resolveLanguageModelId } from "./models";

const MODEL_CONFIG_FIELDS = ["modelo", "modeloAssistencia", "modeloEconomico"] as const;

/** Novas escolhas ficam no catálogo permitido; modelos antigos podem permanecer no mesmo campo. */
export function getUnsupportedAgentModelSelections(next: TAiAgentModelConfig, previous: TAiAgentModelConfig) {
	return MODEL_CONFIG_FIELDS.filter((field) => {
		const value = next[field];
		if (!value) return false;
		const modelId = resolveLanguageModelId(value);
		if (AI_AGENT_MODEL_CATALOG.some((entry) => entry.id === modelId)) return false;
		return !previous[field] || resolveLanguageModelId(previous[field]) !== modelId;
	});
}

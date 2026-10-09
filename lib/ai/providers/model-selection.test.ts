import assert from "node:assert/strict";
import test from "node:test";
import { AiAgentModelConfigSchema, DEFAULT_AI_AGENT_MODEL } from "@/schemas/ai-agents";
import { AI_AGENT_MODEL_CATALOG } from "./model-catalog";
import { getUnsupportedAgentModelSelections } from "./model-selection";
import { resolveModelPrice } from "./pricing";

test("all selectable models have prices and include the provisioning default", () => {
	assert.equal(AI_AGENT_MODEL_CATALOG.length, 4);
	assert.ok(AI_AGENT_MODEL_CATALOG.some((entry) => entry.id === DEFAULT_AI_AGENT_MODEL));
	for (const entry of AI_AGENT_MODEL_CATALOG) {
		assert.notEqual(entry.perfil, "AVANCADO");
		assert.notEqual(resolveModelPrice(entry.id), null);
		assert.deepEqual(getUnsupportedAgentModelSelections({ modelo: entry.id }, { modelo: DEFAULT_AI_AGENT_MODEL }), []);
	}
	assert.equal(AiAgentModelConfigSchema.parse({}).modelo, DEFAULT_AI_AGENT_MODEL);
});

test("rejects expensive or unknown models in main, assistance and economic selections", () => {
	assert.deepEqual(
		getUnsupportedAgentModelSelections(
			{ modelo: "anthropic/claude-sonnet-5.5", modeloAssistencia: "openai/gpt-5", modeloEconomico: "acme/unknown" },
			{ modelo: DEFAULT_AI_AGENT_MODEL },
		),
		["modelo", "modeloAssistencia", "modeloEconomico"],
	);
});

test("preserves unchanged legacy selections but cannot move them into another field", () => {
	const previous = { modelo: "openai/gpt-5" };
	assert.deepEqual(getUnsupportedAgentModelSelections({ modelo: "gpt-5" }, previous), []);
	assert.deepEqual(getUnsupportedAgentModelSelections({ ...previous, modeloAssistencia: "gpt-5" }, previous), ["modeloAssistencia"]);
	assert.deepEqual(getUnsupportedAgentModelSelections({ modelo: "deepseek/deepseek-v4-pro" }, previous), ["modelo"]);
	assert.deepEqual(resolveModelPrice(previous.modelo), { precoEntrada: 1.25, precoSaida: 10 });
});

test("accepts affordable aliases and clearing optional model overrides", () => {
	assert.deepEqual(
		getUnsupportedAgentModelSelections(
			{ modelo: "agent-default", modeloAssistencia: "agent-fast" },
			{ modelo: "openai/gpt-5", modeloEconomico: "openai/gpt-5" },
		),
		[],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { TMessageTriage } from "../triage/message-triage";
import { createModelCallCollector, finalizeRunUsage, stepFromMessageTriage } from "./run-usage";

const triagem: TMessageTriage = {
	intencao: "PRECO_OU_PRODUTO",
	intencaoProbabilidade: 0.9,
	precisaResposta: 0.95,
	exigeHumano: 0.05,
	tokensEntrada: 1000,
	tokensSaida: 0,
	custoUsd: 0.000042,
	custoGatewayUsd: null,
	modelo: "typesafe-ai/jev",
	modeloSolicitado: "typesafe-ai/jev",
};

test("o mesmo response id não vira dois passos", () => {
	const collector = createModelCallCollector({ modeloSolicitado: "openai/gpt-5", papel: "TURNO" });
	collector.onLanguageModelCallEnd({
		responseId: "resp-1",
		modelId: "openai/gpt-5",
		usage: { inputTokens: 10, outputTokens: 4 },
		providerMetadata: { gateway: { cost: 0.2, generationId: "gen_1" } },
		performance: { responseTimeMs: 100 },
	});
	collector.onStepEnd({
		response: { id: "resp-1", modelId: "openai/gpt-5" },
		usage: { inputTokens: 10, outputTokens: 4 },
		toolCalls: [{ toolName: "produtos.consultar" }],
		finishReason: "tool-calls",
	});

	const steps = collector.steps();
	assert.equal(steps.length, 1);
	assert.deepEqual(steps[0]?.ferramentas, ["produtos.consultar"]);
	assert.equal(steps[0]?.custoGatewayUsd, 0.2);
	assert.equal(steps[0]?.usage?.inputTokens, 10);
	assert.equal(steps[0]?.idGeracao, "gen_1");
	assert.equal(steps[0]?.latenciaMs, 100);
	assert.equal(steps[0]?.motivoEncerramento, "tool-calls");
});

test("erro depois de um passo não soma o uso do erro de novo", () => {
	const collector = createModelCallCollector({ modeloSolicitado: "openai/gpt-5", papel: "TURNO" });
	collector.onStepEnd({
		response: { id: "resp-1" },
		usage: { inputTokens: 10, outputTokens: 1 },
	});
	collector.noteError({ usage: { inputTokens: 999, outputTokens: 999 } });
	assert.equal(collector.steps().length, 1);
	assert.equal(collector.steps()[0]?.usage?.inputTokens, 10);
});

test("erro antes de qualquer passo ainda grava o modelo pedido", () => {
	const collector = createModelCallCollector({ modeloSolicitado: "openai/gpt-5", papel: "TURNO" });
	collector.noteError({ cause: { generationId: "gen_err" } });
	const step = collector.steps()[0];
	assert.equal(step?.modeloSolicitado, "openai/gpt-5");
	assert.equal(step?.modeloResolvido, "openai/gpt-5");
	assert.equal(step?.modeloConfirmado, false);
	assert.equal(step?.idGeracao, "gen_err");
});

test("triagem carrega a estimativa do Jev e não o catálogo de atendimento", () => {
	const step = stepFromMessageTriage(triagem);
	assert.equal(step.papel, "TRIAGEM");
	assert.equal(step.custoGatewayUsd, undefined);
	assert.equal(step.custoEstimadoUsd, 0.000042);
	assert.equal(step.usage?.inputTokens, 1000);
});

test("fechamento soma a triagem ao turno e não consulta o gateway quando o USD já veio", async () => {
	let lookups = 0;
	const uso = await finalizeRunUsage({
		triagem,
		steps: [
			{
				papel: "TURNO",
				modeloSolicitado: "openai/gpt-5",
				modeloResolvido: "openai/gpt-5",
				modeloConfirmado: true,
				usage: { inputTokens: 100, outputTokens: 10 },
				custoGatewayUsd: 0.5,
				idGeracao: "gen_turn",
			},
		],
		lookup: async () => {
			lookups += 1;
			return null;
		},
	});

	assert.equal(lookups, 0);
	assert.equal(uso?.modelo, "openai/gpt-5");
	assert.equal(uso?.tokensEntrada, 1100);
	assert.equal(uso?.custoOrigem, "MISTO");
	assert.equal(uso?.custoUsd, 0.500042);
	assert.equal(uso?.custoParcial, undefined);
	assert.equal(uso?.usoParcial, undefined);
});

test("fechamento parcial marca a run e completa o custo pelo id de geração", async () => {
	const uso = await finalizeRunUsage({
		steps: [
			{
				papel: "TURNO",
				modeloSolicitado: "openai/gpt-5",
				modeloResolvido: "openai/gpt-5",
				modeloConfirmado: false,
				usage: { inputTokens: 20, outputTokens: 0 },
				idGeracao: "gen_parcial",
			},
		],
		usoParcial: true,
		lookup: async () => ({ totalCost: 0.08, model: "openai/gpt-5", providerName: "openai" }),
	});

	assert.equal(uso?.usoParcial, true);
	assert.equal(uso?.custoUsd, 0.08);
	assert.equal(uso?.custoOrigem, "GATEWAY");
	assert.equal(uso?.modeloConfirmado, true);
	assert.equal(uso?.idsGeracao?.[0], "gen_parcial");
});

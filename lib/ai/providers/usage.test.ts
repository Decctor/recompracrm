import assert from "node:assert/strict";
import test from "node:test";
import { AiAgentUsageSchema } from "@/schemas/ai-agents";
import type { TAiUsageStep } from "./gateway-usage";
import { normalizeAiUsage } from "./usage";

function turno(partial: Partial<TAiUsageStep> & Pick<TAiUsageStep, "modeloSolicitado">): TAiUsageStep {
	return { papel: "TURNO", modeloConfirmado: true, modeloResolvido: partial.modeloSolicitado, ...partial };
}

test("separa tokens por tipo sem somar cache e raciocínio de novo", () => {
	const uso = normalizeAiUsage([
		turno({
			modeloSolicitado: "openai/gpt-5",
			usage: {
				inputTokens: 1_000_000,
				outputTokens: 0,
				totalTokens: 1_000_000,
				inputTokenDetails: { cacheReadTokens: 100, cacheWriteTokens: 40 },
				outputTokenDetails: { reasoningTokens: 7 },
			},
		}),
	]);

	assert.equal(uso?.tokensEntrada, 1_000_000);
	assert.equal(uso?.tokensSaida, 0);
	assert.equal(uso?.tokensTotal, 1_000_000);
	assert.equal(uso?.tokensEntradaCache, 100);
	assert.equal(uso?.tokensCacheLeitura, 100);
	assert.equal(uso?.tokensCacheEscrita, 40);
	assert.equal(uso?.tokensRaciocinio, 7);
	assert.equal(uso?.custoUsd, 1.25);
	assert.equal(uso?.custoOrigem, "ESTIMADO");
	assert.equal(uso?.custoParcial, undefined);
	assert.equal(uso?.contingencia, undefined);
	assert.ok(uso);
	AiAgentUsageSchema.parse(uso);
});

test("aceita os nomes de token do AI SDK 6", () => {
	const uso = normalizeAiUsage([
		turno({
			modeloSolicitado: "openai/gpt-5",
			custoGatewayUsd: 0.01,
			usage: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 3, reasoningTokens: 2 },
		}),
	]);
	assert.equal(uso?.tokensCacheLeitura, 3);
	assert.equal(uso?.tokensEntradaCache, 3);
	assert.equal(uso?.tokensRaciocinio, 2);
	assert.equal(uso?.custoOrigem, "GATEWAY");
	assert.equal(uso?.custoUsd, 0.01);
});

test("custo do gateway vence o catálogo", () => {
	const uso = normalizeAiUsage([
		turno({
			modeloSolicitado: "openai/gpt-5",
			usage: { inputTokens: 1_000_000, outputTokens: 0 },
			custoGatewayUsd: 0.5,
		}),
	]);
	assert.equal(uso?.custoUsd, 0.5);
	assert.equal(uso?.custoGatewayUsd, 0.5);
	assert.equal(uso?.custoEstimadoUsd, undefined);
	assert.equal(uso?.custoOrigem, "GATEWAY");
});

test("triagem entra no custo e nos tokens e fica fora da cadeia de modelo do turno", () => {
	const uso = normalizeAiUsage([
		{
			papel: "TRIAGEM",
			modeloSolicitado: "typesafe-ai/jev",
			modeloResolvido: "typesafe-ai/jev",
			usage: { inputTokens: 1000, outputTokens: 0 },
			custoEstimadoUsd: 0.000042,
		},
		turno({
			modeloSolicitado: "openai/gpt-5",
			usage: { inputTokens: 100, outputTokens: 10 },
			custoGatewayUsd: 0.5,
		}),
	]);

	assert.equal(uso?.modelo, "openai/gpt-5");
	assert.deepEqual(uso?.modelos, ["openai/gpt-5"]);
	assert.equal(uso?.modeloResolvido, "openai/gpt-5");
	assert.equal(uso?.tokensEntrada, 1100);
	assert.equal(uso?.custoOrigem, "MISTO");
	assert.equal(uso?.custoUsd, 0.500042);
	assert.equal(uso?.custoParcial, undefined);
	assert.equal(uso?.passos?.[0]?.papel, "TRIAGEM");
});

test("jev sem preço de catálogo não marca custo parcial quando a estimativa da triagem já veio", () => {
	const uso = normalizeAiUsage([
		{
			papel: "TRIAGEM",
			modeloSolicitado: "typesafe-ai/jev",
			modeloResolvido: "typesafe-ai/jev",
			usage: { inputTokens: 1000, outputTokens: 0 },
			custoEstimadoUsd: 0.000042,
		},
	]);
	assert.equal(uso?.modelo, "typesafe-ai/jev");
	assert.equal(uso?.custoUsd, 0.000042);
	assert.equal(uso?.custoOrigem, "ESTIMADO");
	assert.equal(uso?.custoParcial, undefined);
});

test("troca de modelo da saída estruturada fica explícita", () => {
	const uso = normalizeAiUsage([
		turno({ modeloSolicitado: "anthropic/claude-sonnet", usage: { inputTokens: 10, outputTokens: 1 }, custoGatewayUsd: 0.1 }),
		turno({
			papel: "SAIDA_ESTRUTURADA",
			modeloSolicitado: "openai/gpt-5",
			modeloResolvido: "openai/gpt-5",
			usage: { inputTokens: 12, outputTokens: 2 },
			custoGatewayUsd: 0.2,
		}),
	]);

	assert.equal(uso?.modelo, "anthropic/claude-sonnet -> openai/gpt-5");
	assert.equal(uso?.modeloSolicitado, "anthropic/claude-sonnet");
	assert.equal(uso?.modeloResolvido, "openai/gpt-5");
	assert.equal(uso?.contingencia?.ocorreu, true);
	assert.equal(uso?.contingencia?.origem, "SAIDA_ESTRUTURADA");
	assert.equal(uso?.contingencia?.solicitado, "anthropic/claude-sonnet");
	assert.equal(uso?.contingencia?.usado, "openai/gpt-5");
	assert.equal(uso?.custoUsd, 0.3);
	assert.ok(uso);
	AiAgentUsageSchema.parse(uso);
});

test("roteamento do gateway registra o modelo resolvido e a contingência", () => {
	const uso = normalizeAiUsage([
		turno({
			modeloSolicitado: "anthropic/claude-sonnet",
			modeloResolvido: "openai/gpt-5",
			modeloConfirmado: true,
			provedor: "openai",
			usage: { inputTokens: 8, outputTokens: 1 },
			custoGatewayUsd: 0.03,
			tentativas: [
				{ modelo: "anthropic/claude-sonnet", sucesso: false, custoUsd: 0.01, origem: "GATEWAY" },
				{ modelo: "openai/gpt-5", sucesso: true, custoUsd: 0.02, origem: "GATEWAY" },
			],
		}),
	]);

	assert.equal(uso?.modelo, "openai/gpt-5");
	assert.equal(uso?.modeloResolvido, "openai/gpt-5");
	assert.equal(uso?.modeloSolicitado, "anthropic/claude-sonnet");
	assert.equal(uso?.contingencia?.origem, "GATEWAY");
	assert.equal(uso?.contingencia?.solicitado, "anthropic/claude-sonnet");
	assert.equal(uso?.contingencia?.usado, "openai/gpt-5");
	assert.equal(uso?.contingencia?.tentativas?.length, 2);
});

test("uso parcial e modelo sem confirmação permanecem no JSON", () => {
	const uso = normalizeAiUsage(
		[turno({ modeloSolicitado: "openai/gpt-5", modeloResolvido: "openai/gpt-5", modeloConfirmado: false, latenciaMs: 12.4 })],
		{ usoParcial: true },
	);
	assert.equal(uso?.usoParcial, true);
	assert.equal(uso?.modeloConfirmado, false);
	assert.equal(uso?.latenciaMs, 12.4);
	assert.equal(uso?.custoParcial, undefined);
	assert.equal(normalizeAiUsage([]), null);
});

test("tokens sem preço conhecido marcam custo parcial", () => {
	const uso = normalizeAiUsage([
		turno({
			modeloSolicitado: "acme/desconhecido",
			modeloResolvido: "acme/desconhecido",
			usage: { inputTokens: 50, outputTokens: 5 },
		}),
	]);
	assert.equal(uso?.custoUsd, undefined);
	assert.equal(uso?.custoParcial, true);
	assert.equal(uso?.modelo, "acme/desconhecido");
});

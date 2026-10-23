import assert from "node:assert/strict";
import test from "node:test";
import { enrichUsageStepsWithGatewayCost, readGatewayCallFacts, readGenerationIdFromError, type TAiUsageStep } from "./gateway-usage";

const turno = (partial: Partial<TAiUsageStep> & Pick<TAiUsageStep, "modeloSolicitado">): TAiUsageStep => ({
	papel: "TURNO",
	...partial,
});

test("custo do gateway aceita string decimal e id de geração", () => {
	const facts = readGatewayCallFacts({ gateway: { cost: "0.0123", generationId: "gen_1" } }, "openai/gpt-5");
	assert.equal(facts.custoUsd, 0.0123);
	assert.equal(facts.idGeracao, "gen_1");
	assert.deepEqual(facts.idsGeracao, ["gen_1"]);
	assert.equal(facts.modeloConfirmado, false);
	assert.equal(facts.modeloResolvido, undefined);
});

test("fallback do gateway soma o custo das tentativas e nomeia o modelo que rodou", () => {
	const facts = readGatewayCallFacts(
		{
			gateway: {
				cost: "9.99",
				generationId: "gen_top",
				routing: {
					originalModelId: "anthropic/claude-sonnet",
					canonicalSlug: "openai/gpt-5",
					finalProvider: "openai",
					resolvedProviderApiModelId: "gpt-5",
					modelAttempts: [
						{ modelId: "anthropic/claude-sonnet", success: false, cost: 0.01, generationId: "gen_fail", provider: "anthropic" },
						{
							modelId: "openai/gpt-5",
							success: true,
							cost: "0.02",
							generationId: "gen_ok",
							provider: "openai",
							usage: { promptTokens: 100, completionTokens: 20, reasoningTokens: 5, cachedTokens: 8, cacheCreationTokens: 3 },
						},
					],
				},
			},
		},
		"anthropic/claude-sonnet",
	);

	assert.equal(facts.custoUsd, 0.03);
	assert.equal(facts.modeloResolvido, "openai/gpt-5");
	assert.equal(facts.modeloConfirmado, true);
	assert.equal(facts.provedor, "openai");
	assert.equal(facts.modeloProvedorId, "gpt-5");
	assert.equal(facts.idGeracao, "gen_ok");
	assert.deepEqual(facts.idsGeracao, ["gen_top", "gen_fail", "gen_ok"]);
	assert.equal(facts.tentativas.length, 2);
	assert.equal(facts.tentativas[0]?.sucesso, false);
	assert.equal(facts.tokens?.inputTokens, 100);
	assert.equal(facts.tokens?.outputTokens, 20);
	assert.equal(facts.tokens?.inputTokenDetails?.cacheReadTokens, 8);
	assert.equal(facts.tokens?.inputTokenDetails?.cacheWriteTokens, 3);
	assert.equal(facts.tokens?.outputTokenDetails?.reasoningTokens, 5);
});

test("sem metadata o modelo da resposta não é tratado como confirmado", () => {
	const facts = readGatewayCallFacts(undefined, "openai/gpt-5");
	assert.equal(facts.modeloConfirmado, false);
	assert.equal(facts.custoUsd, undefined);
	assert.deepEqual(facts.tentativas, []);
	assert.deepEqual(facts.idsGeracao, []);
});

test("id de geração sobe pela cadeia de causas", () => {
	const error = { cause: { providerMetadata: { gateway: { generationId: "gen_err" } } } };
	assert.equal(readGenerationIdFromError(error), "gen_err");
	assert.equal(readGenerationIdFromError({ data: { generationId: "gen_data" } }), "gen_data");
	assert.equal(readGenerationIdFromError(new Error("sem id")), undefined);
});

test("consulta da geração preenche custo e não substitui tokens que o SDK já trouxe", async () => {
	let lookups = 0;
	const steps = await enrichUsageStepsWithGatewayCost(
		[
			turno({
				modeloSolicitado: "openai/gpt-5",
				idGeracao: "gen_1",
				usage: { inputTokens: 10, outputTokens: 2 },
			}),
			turno({ modeloSolicitado: "openai/gpt-5", custoGatewayUsd: 0.4, idGeracao: "gen_ja" }),
		],
		{
			lookup: async (id) => {
				lookups += 1;
				assert.equal(id, "gen_1");
				return { totalCost: 0.25, model: "openai/gpt-5", providerName: "openai", generationTime: 400, promptTokens: 99, completionTokens: 1 };
			},
		},
	);

	assert.equal(lookups, 1);
	assert.equal(steps[0]?.custoGatewayUsd, 0.25);
	assert.equal(steps[0]?.usage?.inputTokens, 10);
	assert.equal(steps[0]?.modeloResolvido, "openai/gpt-5");
	assert.equal(steps[0]?.modeloConfirmado, true);
	assert.equal(steps[0]?.provedor, "openai");
	assert.equal(steps[0]?.latenciaMs, 400);
	assert.equal(steps[1]?.custoGatewayUsd, 0.4);
});

test("consulta da geração soma os ids da mesma chamada e preenche tokens ausentes", async () => {
	const [step] = await enrichUsageStepsWithGatewayCost([turno({ modeloSolicitado: "openai/gpt-5", idsGeracao: ["gen_a", "gen_b"] })], {
		lookup: async (id) => ({
			totalCost: id === "gen_a" ? 0.1 : 0.2,
			model: id === "gen_b" ? "openai/gpt-5-mini" : "openai/gpt-5",
			promptTokens: 4,
			completionTokens: 1,
			reasoningTokens: 1,
			cachedTokens: 2,
			cacheCreationTokens: 3,
		}),
	});

	assert.equal(step?.custoGatewayUsd, 0.3);
	assert.equal(step?.modeloResolvido, "openai/gpt-5-mini");
	assert.equal(step?.usage?.inputTokens, 4);
	assert.equal(step?.usage?.outputTokenDetails?.reasoningTokens, 1);
	assert.equal(step?.usage?.inputTokenDetails?.cacheReadTokens, 2);
	assert.equal(step?.usage?.inputTokenDetails?.cacheWriteTokens, 3);
});

test("custo zero na consulta não apaga a estimativa do catálogo", async () => {
	const [step] = await enrichUsageStepsWithGatewayCost(
		[turno({ modeloSolicitado: "openai/gpt-5", idGeracao: "gen_0", usage: { inputTokens: 10, outputTokens: 1 } })],
		{ lookup: async () => ({ totalCost: 0, model: "openai/gpt-5" }) },
	);
	assert.equal(step?.custoGatewayUsd, undefined);
	assert.equal(step?.modeloConfirmado, undefined);
});

test("timeout da consulta devolve o passo sem custo do gateway", async () => {
	const started = Date.now();
	const steps = await enrichUsageStepsWithGatewayCost([turno({ modeloSolicitado: "openai/gpt-5", idGeracao: "gen_lento" })], {
		timeoutMs: 30,
		lookup: () => new Promise((resolve) => setTimeout(() => resolve({ totalCost: 1, model: "openai/gpt-5" }), 200)),
	});
	assert.ok(Date.now() - started < 150);
	assert.equal(steps[0]?.custoGatewayUsd, undefined);
	await new Promise((resolve) => setTimeout(resolve, 220));
});

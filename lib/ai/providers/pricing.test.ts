import assert from "node:assert/strict";
import test from "node:test";
import { estimateRunCostUsd, estimateUsageCostUsd, formatUsd, resolveModelPrice } from "./pricing";

test("resolveModelPrice resolves aliases and ids sem provider pelo catálogo", () => {
	assert.deepEqual(resolveModelPrice("agent-fast"), { precoEntrada: 0.25, precoSaida: 2 });
	assert.deepEqual(resolveModelPrice("gpt-5"), { precoEntrada: 1.25, precoSaida: 10 });
	assert.equal(resolveModelPrice("acme/modelo-inexistente"), null);
});

test("estimateUsageCostUsd multiplica entrada e saída pelo preço por milhão", () => {
	const cost = estimateUsageCostUsd({ inputTokens: 10_000, outputTokens: 1_000 }, { precoEntrada: 1, precoSaida: 10 });
	assert.equal(cost, 0.02);
	assert.equal(estimateUsageCostUsd(undefined, { precoEntrada: 1, precoSaida: 10 }), null);
	assert.equal(estimateUsageCostUsd({ totalTokens: 5 }, { precoEntrada: 1, precoSaida: 10 }), null);
});

test("estimateRunCostUsd soma trechos e marca parcial quando um modelo não tem preço", () => {
	const full = estimateRunCostUsd([
		{ modelo: "openai/gpt-5", usage: { inputTokens: 1_000_000, outputTokens: 0 } },
		{ modelo: "openai/gpt-5-mini", usage: { inputTokens: 0, outputTokens: 1_000_000 } },
	]);
	assert.deepEqual(full, { custoUsd: 3.25, parcial: false });

	const partial = estimateRunCostUsd([
		{ modelo: "openai/gpt-5", usage: { inputTokens: 1_000_000, outputTokens: 0 } },
		{ modelo: "acme/desconhecido", usage: { inputTokens: 1_000_000, outputTokens: 0 } },
	]);
	assert.deepEqual(partial, { custoUsd: 1.25, parcial: true });

	assert.deepEqual(estimateRunCostUsd([{ modelo: "acme/desconhecido", usage: undefined }]), { custoUsd: null, parcial: true });
});

test("formatUsd mostra quatro casas abaixo de um centavo", () => {
	assert.equal(formatUsd(0.0031), "US$ 0,0031");
	assert.equal(formatUsd(12.5), "US$ 12,50");
	assert.equal(formatUsd(null), "—");
});

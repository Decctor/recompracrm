import assert from "node:assert/strict";
import test from "node:test";
import {
	buildPromotionInteractionMetadata,
	createEmptyPromotionClientSignals,
	getPromotionProductEffectivePrice,
	rankPromotionProductForClient,
	type TPromotionProductCandidate,
} from "./promotion-suggestion";

function buildCandidate(overrides: Partial<TPromotionProductCandidate> & { produtoId: string }): TPromotionProductCandidate {
	return {
		nome: `Produto ${overrides.produtoId}`,
		grupo: null,
		precoVenda: 10,
		imagemCapaUrl: null,
		precoPromocional: null,
		...overrides,
	};
}

const candidates = [
	buildCandidate({ produtoId: "primeiro", grupo: "CAFES" }),
	buildCandidate({ produtoId: "favorito", grupo: "DOCES" }),
	buildCandidate({ produtoId: "mais-gasto", grupo: "SALGADOS" }),
	buildCandidate({ produtoId: "mesmo-grupo", grupo: "PADARIA" }),
];

test("regra 1: o produto favorito do cliente vence quando está na lista promovida", () => {
	const suggested = rankPromotionProductForClient({
		candidates,
		signals: {
			produtoMaisCompradoId: "favorito",
			grupoProdutoMaisComprado: "PADARIA",
			// Mesmo com gasto maior em outro produto, o favorito tem prioridade.
			valorPorProdutoId: new Map([["mais-gasto", 999]]),
		},
	});
	assert.equal(suggested?.produtoId, "favorito");
});

test("regra 2: sem favorito na lista, vence o produto em que o cliente mais gastou", () => {
	const suggested = rankPromotionProductForClient({
		candidates,
		signals: {
			produtoMaisCompradoId: "produto-fora-da-lista",
			grupoProdutoMaisComprado: "PADARIA",
			valorPorProdutoId: new Map([
				["primeiro", 20],
				["mais-gasto", 80],
			]),
		},
	});
	assert.equal(suggested?.produtoId, "mais-gasto");
});

test("regra 3: sem histórico nos produtos promovidos, vence o produto do grupo favorito", () => {
	const suggested = rankPromotionProductForClient({
		candidates,
		signals: {
			produtoMaisCompradoId: null,
			grupoProdutoMaisComprado: "PADARIA",
			valorPorProdutoId: new Map(),
		},
	});
	assert.equal(suggested?.produtoId, "mesmo-grupo");
});

test("regra 4: cliente sem nenhum sinal cai na ordem configurada da campanha", () => {
	const suggested = rankPromotionProductForClient({
		candidates,
		signals: createEmptyPromotionClientSignals(),
	});
	assert.equal(suggested?.produtoId, "primeiro");
});

test("a resolução nunca fica vazia quando há produtos disponíveis", () => {
	const suggested = rankPromotionProductForClient({
		candidates: [buildCandidate({ produtoId: "unico" })],
		signals: createEmptyPromotionClientSignals(),
	});
	assert.equal(suggested?.produtoId, "unico");
});

test("lista vazia resolve para nulo — o chamador trata como falha de configuração", () => {
	const suggested = rankPromotionProductForClient({ candidates: [], signals: createEmptyPromotionClientSignals() });
	assert.equal(suggested, null);
});

test("empate de gasto é resolvido pela ordem da lista", () => {
	const suggested = rankPromotionProductForClient({
		candidates,
		signals: {
			produtoMaisCompradoId: null,
			grupoProdutoMaisComprado: null,
			valorPorProdutoId: new Map([
				["mais-gasto", 50],
				["mesmo-grupo", 50],
			]),
		},
	});
	assert.equal(suggested?.produtoId, "mais-gasto");
});

test("preço efetivo usa a sobrescrita quando existe e o preço de venda quando não", () => {
	assert.equal(getPromotionProductEffectivePrice(buildCandidate({ produtoId: "a", precoVenda: 12.9, precoPromocional: 9.9 })), 9.9);
	assert.equal(getPromotionProductEffectivePrice(buildCandidate({ produtoId: "b", precoVenda: 12.9, precoPromocional: null })), 12.9);
});

test("produto sem preço de venda omite o preço original em vez de afirmar R$ 0,00", () => {
	const metadata = buildPromotionInteractionMetadata(buildCandidate({ produtoId: "so-variantes", precoVenda: null, precoPromocional: 9.9 }));
	assert.equal("promocaoProdutoPrecoOriginal" in metadata, false);
	assert.equal(metadata.promocaoProdutoPrecoPromocional, 9.9);
});

test("produto com preço de venda mantém a âncora de comparação", () => {
	const metadata = buildPromotionInteractionMetadata(buildCandidate({ produtoId: "com-preco", precoVenda: 12.9, precoPromocional: 9.9 }));
	assert.equal(metadata.promocaoProdutoPrecoOriginal, 12.9);
	assert.equal(metadata.promocaoProdutoPrecoPromocional, 9.9);
});

import assert from "node:assert/strict";
import test from "node:test";
import { projectAddOnReferencesToChannel } from "./sales-channels";
import { type TCatalogOrderItemProduct, resolveCatalogOrderItem } from "./resolve-catalog-order-item";

const sabores = {
	nome: "Sabores",
	minOpcoes: 1,
	maxOpcoes: 2,
	opcoes: [
		{ id: "morango", nome: "Morango", precoDelta: 0, maxQtdePorItem: 1 },
		{ id: "pistache", nome: "Pistache", precoDelta: 3, maxQtdePorItem: 1 },
	],
};
const extras = {
	nome: "Extras",
	minOpcoes: 0,
	maxOpcoes: 0,
	opcoes: [{ id: "granola", nome: "Granola", precoDelta: 2, maxQtdePorItem: 3 }],
};

const gelato: TCatalogOrderItemProduct = {
	id: "gelato",
	nome: "Gelato",
	codigo: "GEL",
	grupo: "Sorvetes",
	imagemCapaUrl: null,
	precoVenda: null,
	precoCusto: null,
	addOnsReferencias: [{ grupo: extras }],
	variantes: [
		{ id: "p", nome: "Pequeno", codigo: "GEL-P", precoVenda: 10, precoCusto: 4, addOnsReferencias: [{ grupo: sabores }] },
		{ id: "g", nome: "Grande", codigo: "GEL-G", precoVenda: 16, precoCusto: 6, addOnsReferencias: [{ grupo: { ...sabores, maxOpcoes: 3 } }] },
	],
};

const simples: TCatalogOrderItemProduct = {
	id: "agua",
	nome: "Água",
	codigo: "AGUA",
	precoVenda: 5,
	variantes: [],
	addOnsReferencias: [],
};

function expectBadRequest(fn: () => unknown, pattern: RegExp) {
	assert.throws(fn, (error: unknown) => {
		assert.ok(error instanceof Error);
		assert.equal((error as { status?: number }).status, 400);
		assert.match(error.message, pattern);
		return true;
	});
}

test("produto simples: preço do catálogo, sem modificadores", () => {
	const item = resolveCatalogOrderItem({ product: simples, variantId: null, quantity: 3, modifiers: [] });
	assert.equal(item.valorUnitarioBase, 5);
	assert.equal(item.valorModificadores, 0);
	assert.equal(item.valorTotalLiquido, 15);
	assert.equal(item.nome, "Água");
	assert.equal(item.produtoVarianteId, null);
	assert.deepEqual(item.modificadores, []);
});

test("produto com variantes exige a escolha da variante", () => {
	expectBadRequest(() => resolveCatalogOrderItem({ product: gelato, variantId: null, quantity: 1, modifiers: [] }), /Selecione uma variante/);
	expectBadRequest(() => resolveCatalogOrderItem({ product: gelato, variantId: "xl", quantity: 1, modifiers: [] }), /variante .* não está disponível/);
});

test("grupo obrigatório da variante bloqueia o item sem escolha", () => {
	expectBadRequest(() => resolveCatalogOrderItem({ product: gelato, variantId: "p", quantity: 1, modifiers: [] }), /Escolha uma opção em "Sabores"/);
});

test("preço = variante + deltas × quantidade, com nome e custo da variante", () => {
	const item = resolveCatalogOrderItem({
		product: gelato,
		variantId: "p",
		quantity: 2,
		modifiers: [
			{ opcaoId: "pistache", quantidade: 1 },
			{ opcaoId: "granola", quantidade: 2 },
		],
		observacoes: "  sem calda  ",
	});
	assert.equal(item.nome, "Gelato - Pequeno");
	assert.equal(item.codigo, "GEL-P");
	assert.equal(item.valorUnitarioBase, 10);
	assert.equal(item.valorModificadores, 7);
	assert.equal(item.valorUnitarioFinal, 17);
	assert.equal(item.valorTotalBruto, 34);
	assert.equal(item.valorTotalLiquido, 34);
	assert.equal(item.valorCustoUnitario, 4);
	assert.equal(item.valorCustoTotal, 8);
	assert.equal(item.observacoes, "sem calda");
	assert.deepEqual(item.modificadores, [
		{ opcaoId: "pistache", nome: "Pistache", quantidade: 1, valorUnitario: 3, valorTotal: 3 },
		{ opcaoId: "granola", nome: "Granola", quantidade: 2, valorUnitario: 2, valorTotal: 4 },
	]);
});

test("máximo do grupo vale pelo vínculo da variante escolhida", () => {
	const three = [
		{ opcaoId: "morango", quantidade: 1 },
		{ opcaoId: "pistache", quantidade: 1 },
	];
	// Pequeno permite 2 sabores; Grande permite 3. A mesma lista de opções, limites diferentes.
	assert.equal(resolveCatalogOrderItem({ product: gelato, variantId: "p", quantity: 1, modifiers: three }).modificadores.length, 2);
	expectBadRequest(
		() => resolveCatalogOrderItem({ product: gelato, variantId: "p", quantity: 1, modifiers: [...three, { opcaoId: "morango", quantidade: 1 }] }),
		/Quantidade máxima excedida para "Morango"/,
	);
});

test("opção repetida soma antes de validar e aparece como uma linha", () => {
	const item = resolveCatalogOrderItem({
		product: gelato,
		variantId: "p",
		quantity: 1,
		modifiers: [
			{ opcaoId: "morango", quantidade: 1 },
			{ opcaoId: "granola", quantidade: 1 },
			{ opcaoId: "granola", quantidade: 1 },
		],
	});
	const granola = item.modificadores.find((modifier) => modifier.opcaoId === "granola");
	assert.equal(granola?.quantidade, 2);
	assert.equal(item.modificadores.length, 2);
});

test("maxQtdePorItem limita a repetição de uma opção", () => {
	expectBadRequest(
		() =>
			resolveCatalogOrderItem({
				product: gelato,
				variantId: "p",
				quantity: 1,
				modifiers: [
					{ opcaoId: "morango", quantidade: 1 },
					{ opcaoId: "granola", quantidade: 4 },
				],
			}),
		/Quantidade máxima excedida para "Granola"/,
	);
});

test("opção fora dos grupos do produto é recusada", () => {
	expectBadRequest(
		() => resolveCatalogOrderItem({ product: simples, variantId: null, quantity: 1, modifiers: [{ opcaoId: "granola", quantidade: 1 }] }),
		/não está disponível/,
	);
});

test("opção de outra variante não vale para a variante escolhida", () => {
	// "Sabores" só existe nas variantes; o produto base não a conhece, mas as duas variantes sim.
	// Simula um grupo exclusivo da variante Grande e tenta usá-lo no Pequeno.
	const product: TCatalogOrderItemProduct = {
		...gelato,
		variantes: [
			{ ...gelato.variantes[0], addOnsReferencias: [] },
			{ ...gelato.variantes[1], addOnsReferencias: [{ grupo: { ...sabores, minOpcoes: 0 } }] },
		],
	};
	expectBadRequest(
		() => resolveCatalogOrderItem({ product, variantId: "p", quantity: 1, modifiers: [{ opcaoId: "morango", quantidade: 1 }] }),
		/não está disponível/,
	);
});

test("canal que não exige mínimos libera o item sem escolher o grupo obrigatório", () => {
	// A projeção do canal acontece ANTES: o resolvedor recebe o grupo já com minOpcoes 0.
	const state = { channel: { exigirAdicionaisMinimos: false }, optionOverrides: new Map() };
	const product: TCatalogOrderItemProduct = {
		...gelato,
		variantes: gelato.variantes.map((variant) => ({
			...variant,
			addOnsReferencias: projectAddOnReferencesToChannel(state, variant.addOnsReferencias),
		})),
	};
	const item = resolveCatalogOrderItem({ product, variantId: "p", quantity: 1, modifiers: [] });
	assert.equal(item.valorTotalLiquido, 10);
});

test("preço da opção no canal substitui o delta base", () => {
	const state = { channel: { exigirAdicionaisMinimos: true }, optionOverrides: new Map([["pistache", { disponivel: null, precoDelta: 5 }]]) };
	const product: TCatalogOrderItemProduct = {
		...gelato,
		variantes: gelato.variantes.map((variant) => ({
			...variant,
			addOnsReferencias: projectAddOnReferencesToChannel(state, variant.addOnsReferencias),
		})),
	};
	const item = resolveCatalogOrderItem({ product, variantId: "p", quantity: 1, modifiers: [{ opcaoId: "pistache", quantidade: 1 }] });
	assert.equal(item.valorModificadores, 5);
});

test("opção pausada no canal some da projeção e é recusada", () => {
	const state = { channel: { exigirAdicionaisMinimos: true }, optionOverrides: new Map([["pistache", { disponivel: false, precoDelta: null }]]) };
	const product: TCatalogOrderItemProduct = {
		...gelato,
		variantes: gelato.variantes.map((variant) => ({
			...variant,
			addOnsReferencias: projectAddOnReferencesToChannel(state, variant.addOnsReferencias),
		})),
	};
	// Morango satisfaz o grupo; o pistache pausado é o que sobra sem destino.
	expectBadRequest(
		() =>
			resolveCatalogOrderItem({
				product,
				variantId: "p",
				quantity: 1,
				modifiers: [
					{ opcaoId: "morango", quantidade: 1 },
					{ opcaoId: "pistache", quantidade: 1 },
				],
			}),
		/não está disponível/,
	);
});

test("quantidades inválidas são recusadas", () => {
	expectBadRequest(() => resolveCatalogOrderItem({ product: simples, variantId: null, quantity: 0, modifiers: [] }), /Quantidade inválida/);
	expectBadRequest(
		() => resolveCatalogOrderItem({ product: simples, variantId: null, quantity: 1, modifiers: [{ opcaoId: "x", quantidade: 0 }] }),
		/Quantidade inválida em um adicional/,
	);
});

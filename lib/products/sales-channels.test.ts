import assert from "node:assert/strict";
import test from "node:test";
import {
	channelAddOnReferences,
	resolveChannelAvailability,
	resolveChannelPrice,
	splitChannelSettingNodes,
	validateChannelSettingNodes,
} from "./sales-channels";

const product = { ativo: true, vendavel: true, precoVenda: 20, rastreamentoEstoqueAtivo: false, quantidade: 0 };

test("ausência de override herda o padrão do canal, nos dois modos", () => {
	// O caso que justifica a tabela esparsa: sem linha, o modo do canal decide sozinho.
	assert.equal(resolveChannelAvailability({ product, channel: { canal: "POS", catalogoModo: "TODOS" } }), true);
	assert.equal(resolveChannelAvailability({ product, channel: { canal: "POS", catalogoModo: "SELECIONADOS" } }), false);
});

test("override explícito do produto vence o padrão do canal nos dois sentidos", () => {
	assert.equal(
		resolveChannelAvailability({ product, channel: { canal: "POS", catalogoModo: "TODOS" }, overrides: { product: { disponivel: false } } }),
		false,
	);
	assert.equal(
		resolveChannelAvailability({ product, channel: { canal: "POS", catalogoModo: "SELECIONADOS" }, overrides: { product: { disponivel: true } } }),
		true,
	);
});

test("variante herda a presença do produto e só pode restringir", () => {
	const variant = { ativo: true, precoVenda: 25 };
	// Produto incluído em modo SELECIONADOS: variantes seguem sem precisar de linha própria.
	assert.equal(
		resolveChannelAvailability({
			product,
			variant,
			channel: { canal: "POS", catalogoModo: "SELECIONADOS" },
			overrides: { product: { disponivel: true } },
		}),
		true,
	);
	// Linha da variante restringe dentro de um produto visível.
	assert.equal(
		resolveChannelAvailability({
			product,
			variant,
			channel: { canal: "POS", catalogoModo: "TODOS" },
			overrides: { variant: { disponivel: false } },
		}),
		false,
	);
	// Linha disponivel=true numa variante NÃO ressuscita um produto excluído do canal.
	assert.equal(
		resolveChannelAvailability({
			product,
			variant,
			channel: { canal: "POS", catalogoModo: "TODOS" },
			overrides: { product: { disponivel: false }, variant: { disponivel: true } },
		}),
		false,
	);
});

test("vendabilidade e atividade bloqueiam antes de qualquer override", () => {
	// Matéria-prima não volta a ser vendável porque alguém marcou disponível no canal.
	assert.equal(
		resolveChannelAvailability({
			product: { ...product, vendavel: false },
			channel: { canal: "POS", catalogoModo: "TODOS" },
			overrides: { product: { disponivel: true } },
		}),
		false,
	);
	assert.equal(
		resolveChannelAvailability({
			product: { ...product, ativo: false },
			channel: { canal: "POS", catalogoModo: "TODOS" },
			overrides: { product: { disponivel: true } },
		}),
		false,
	);
});

test("os gates de preço e estoque valem só para a loja digital", () => {
	const semEstoque = { ...product, rastreamentoEstoqueAtivo: true };
	assert.equal(resolveChannelAvailability({ product: semEstoque, channel: { canal: "SHOP", catalogoModo: "TODOS" } }), false);
	assert.equal(resolveChannelAvailability({ product: semEstoque, channel: { canal: "POS", catalogoModo: "TODOS" } }), true);

	const semPreco = { ...product, precoVenda: 0 };
	assert.equal(resolveChannelAvailability({ product: semPreco, channel: { canal: "SHOP", catalogoModo: "TODOS" } }), false);
	// Um override de preço no canal torna vendável na loja um produto sem preço base.
	assert.equal(
		resolveChannelAvailability({ product: semPreco, channel: { canal: "SHOP", catalogoModo: "TODOS" }, overrides: { product: { precoVenda: 15 } } }),
		true,
	);
});

test("o preço resolve por nó: override do nó, senão o preço base do nó", () => {
	assert.equal(resolveChannelPrice(product, null, { product: { precoVenda: 25 } }), 25);
	assert.equal(resolveChannelPrice(product, { ativo: true, precoVenda: 30 }, {}), 30);
	assert.equal(resolveChannelPrice(product, null, {}), 20);
	// O override da variante vence o preço da própria variante.
	assert.equal(resolveChannelPrice(product, { ativo: true, precoVenda: 30 }, { variant: { precoVenda: 27 } }), 27);
	// Override nível-produto NÃO vaza para a venda de uma variante (node-scoped).
	assert.equal(resolveChannelPrice(product, { ativo: true, precoVenda: 30 }, { product: { precoVenda: 27 } }), 30);
});

const REFERENCIAS = [
	{ produtoAddOnId: "g1", ordem: 0, grupo: { id: "g1", nome: "Sabor", minOpcoes: 1, maxOpcoes: 1, opcoes: [{ id: "o1" }] } },
	{ produtoAddOnId: "g2", ordem: 1, grupo: { id: "g2", nome: "Cobertura", minOpcoes: 0, maxOpcoes: 3, opcoes: [{ id: "o2" }] } },
];

test("canal que exige mínimos devolve os grupos como estão", () => {
	assert.equal(channelAddOnReferences({ exigirAdicionaisMinimos: true }, REFERENCIAS), REFERENCIAS);
});

test("canal ausente preserva o comportamento legado (exige)", () => {
	// Org ainda sem a linha do canal não pode virar balcão relaxado por acidente.
	assert.equal(channelAddOnReferences(null, REFERENCIAS), REFERENCIAS);
	assert.equal(channelAddOnReferences(undefined, REFERENCIAS), REFERENCIAS);
});

test("canal que dispensa mínimos zera minOpcoes e preserva o resto do grupo", () => {
	const projetadas = channelAddOnReferences({ exigirAdicionaisMinimos: false }, REFERENCIAS);

	assert.deepEqual(
		projetadas.map((referencia) => referencia.grupo.minOpcoes),
		[0, 0],
	);
	// O máximo é o outro lado da regra e não se move: dispensar a escolha não libera escolher demais.
	assert.deepEqual(
		projetadas.map((referencia) => referencia.grupo.maxOpcoes),
		[1, 3],
	);
	assert.deepEqual(
		projetadas.map((referencia) => referencia.grupo.opcoes),
		[[{ id: "o1" }], [{ id: "o2" }]],
	);
	assert.deepEqual(
		projetadas.map((referencia) => referencia.ordem),
		[0, 1],
	);
	// A projeção é uma cópia: o catálogo em memória do chamador não é mutado.
	assert.equal(REFERENCIAS[0].grupo.minOpcoes, 1);
});

// ---------------------------------------------------------------------------
// validateChannelSettingNodes / splitChannelSettingNodes
// ---------------------------------------------------------------------------

const CANAIS = new Set(["pos", "shop"]);

test("matriz válida de produto sem variantes passa, com preço nível-produto", () => {
	const erro = validateChannelSettingNodes({
		settings: [
			{ canalVendaId: "pos", produtoVarianteId: null, disponivel: null, precoVenda: 12 },
			{ canalVendaId: "shop", produtoVarianteId: null, disponivel: false, precoVenda: null },
		],
		ownedChannelIds: CANAIS,
		variantIds: new Set(),
	});
	assert.equal(erro, null);
});

test("nó repetido (canal + variante) é recusado antes de virar violação de unique", () => {
	const erro = validateChannelSettingNodes({
		settings: [
			{ canalVendaId: "pos", produtoVarianteId: "v1", disponivel: true },
			{ canalVendaId: "pos", produtoVarianteId: "v1", precoVenda: 10 },
		],
		ownedChannelIds: CANAIS,
		variantIds: new Set(["v1"]),
	});
	assert.equal(erro, "Há configurações repetidas para o mesmo canal e variante.");
	// Nível-produto (nulo) e nível-variante são nós diferentes do mesmo canal.
	assert.equal(
		validateChannelSettingNodes({
			settings: [
				{ canalVendaId: "pos", produtoVarianteId: null, disponivel: true },
				{ canalVendaId: "pos", produtoVarianteId: "v1", disponivel: false },
			],
			ownedChannelIds: CANAIS,
			variantIds: new Set(["v1"]),
		}),
		null,
	);
});

test("canal de outra organização e variante de outro produto são recusados", () => {
	assert.equal(
		validateChannelSettingNodes({
			settings: [{ canalVendaId: "ifood-da-outra-org", disponivel: true }],
			ownedChannelIds: CANAIS,
			variantIds: new Set(),
		}),
		"Um canal de venda não pertence à organização.",
	);
	assert.equal(
		validateChannelSettingNodes({
			settings: [{ canalVendaId: "pos", produtoVarianteId: "v-alheia", disponivel: true }],
			ownedChannelIds: CANAIS,
			variantIds: new Set(["v1"]),
		}),
		"Uma variante não pertence ao produto.",
	);
});

test("produto com variantes não aceita preço nível-produto, mas aceita disponibilidade", () => {
	const variantes = new Set(["v1"]);
	assert.equal(
		validateChannelSettingNodes({
			settings: [{ canalVendaId: "pos", produtoVarianteId: null, precoVenda: 10 }],
			ownedChannelIds: CANAIS,
			variantIds: variantes,
		}),
		"Defina o preço por canal em cada variante deste produto.",
	);
	assert.equal(
		validateChannelSettingNodes({
			settings: [
				{ canalVendaId: "pos", produtoVarianteId: null, disponivel: false },
				{ canalVendaId: "pos", produtoVarianteId: "v1", precoVenda: 10 },
			],
			ownedChannelIds: CANAIS,
			variantIds: variantes,
		}),
		null,
	);
});

test("hasVariants explícito recusa preço nível-produto mesmo sem referências de variante", () => {
	// POST com variantes sem referenciaId: o conjunto de refs é vazio, mas o produto TEM variantes.
	assert.equal(
		validateChannelSettingNodes({
			settings: [{ canalVendaId: "pos", produtoVarianteId: null, precoVenda: 10 }],
			ownedChannelIds: CANAIS,
			variantIds: new Set(),
			hasVariants: true,
		}),
		"Defina o preço por canal em cada variante deste produto.",
	);
});

test("nó com os dois campos nulos volta a herdar; qualquer um preenchido vira linha", () => {
	const { upserts, clears } = splitChannelSettingNodes([
		{ canalVendaId: "pos", produtoVarianteId: null, disponivel: null, precoVenda: null },
		{ canalVendaId: "pos", produtoVarianteId: "v1", disponivel: false, precoVenda: null },
		{ canalVendaId: "shop", produtoVarianteId: "v1", disponivel: null, precoVenda: 0 },
	]);
	assert.deepEqual(
		clears.map((node) => node.canalVendaId + ":" + (node.produtoVarianteId ?? "")),
		["pos:"],
	);
	// Preço zero é um override (não é "sem preço"), então entra nas linhas.
	assert.deepEqual(
		upserts.map((node) => node.canalVendaId + ":" + node.produtoVarianteId),
		["pos:v1", "shop:v1"],
	);
});

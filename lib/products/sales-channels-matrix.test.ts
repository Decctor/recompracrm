import assert from "node:assert/strict";
import test from "node:test";
import { sortProductsByChannelOrder } from "./sales-channels";
import { SalesChannelSchema } from "@/schemas/sales-channels";
import {
	buildMatrixCellMap,
	diffMatrixCells,
	diffMatrixChannels,
	groupMatrixProducts,
	matrixNodeKey,
	moveGroupInOrder,
	moveProductInOrder,
	parseMatrixNodeKey,
	productsTouchingChannels,
	renameGroupInOrder,
} from "./sales-channels-matrix";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IFOOD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test("ordem vazia mantém fallback alfabético estável; IDs órfãos não afetam produtos", () => {
	const produtos = [
		{ id: "b", nome: "Água" },
		{ id: "c", nome: "Bolo" },
		{ id: "a", nome: "Água" },
	];
	assert.deepEqual(
		sortProductsByChannelOrder(produtos, []).map((p) => p.id),
		["a", "b", "c"],
	);
	assert.deepEqual(
		sortProductsByChannelOrder(produtos, ["deleted", "c"]).map((p) => p.id),
		["c", "a", "b"],
	);
});

test("ordem de produtos aceita reset e recusa IDs vazios ou tipos inválidos", () => {
	const schema = SalesChannelSchema.shape.ordemProdutos;
	assert.deepEqual(schema.parse([]), []);
	assert.equal(schema.safeParse([""]).success, false);
	assert.equal(schema.safeParse([123]).success, false);
	assert.equal(schema.safeParse("id").success, false);
});

test("a chave do nó é reversível, com variante nula representada por segmento vazio", () => {
	assert.deepEqual(parseMatrixNodeKey(matrixNodeKey(P1, POS, null)), { produtoId: P1, canalVendaId: POS, produtoVarianteId: null });
	assert.deepEqual(parseMatrixNodeKey(matrixNodeKey(P1, POS, V1)), { produtoId: P1, canalVendaId: POS, produtoVarianteId: V1 });
});

test("o mapa de células ignora linhas que não desviam de nada", () => {
	const cells = buildMatrixCellMap([
		{ produtoId: P1, canalVendaId: POS, produtoVarianteId: null, disponivel: false, precoVenda: null },
		{ produtoId: P2, canalVendaId: POS, produtoVarianteId: null, disponivel: null, precoVenda: null },
	]);
	assert.equal(cells.size, 1);
	assert.deepEqual(cells.get(matrixNodeKey(P1, POS, null)), { disponivel: false, precoVenda: null });
});

test("o diff só carrega os nós que mudaram, agrupados por produto", () => {
	const baseline = buildMatrixCellMap([
		{ produtoId: P1, canalVendaId: POS, produtoVarianteId: null, disponivel: false, precoVenda: null },
		{ produtoId: P2, canalVendaId: POS, produtoVarianteId: V1, disponivel: null, precoVenda: 12 },
	]);
	const draft = new Map(baseline);
	// P1 volta a herdar; P2 muda o preço da variante; P2 ganha override novo no iFood.
	draft.set(matrixNodeKey(P1, POS, null), { disponivel: null, precoVenda: null });
	draft.set(matrixNodeKey(P2, POS, V1), { disponivel: null, precoVenda: 15 });
	draft.set(matrixNodeKey(P2, IFOOD, V1), { disponivel: true, precoVenda: null });

	const patches = diffMatrixCells({ baseline, draft });
	assert.deepEqual(patches, [
		{ produtoId: P1, settings: [{ canalVendaId: POS, produtoVarianteId: null, disponivel: null, precoVenda: null }] },
		{
			produtoId: P2,
			settings: [
				{ canalVendaId: POS, produtoVarianteId: V1, disponivel: null, precoVenda: 15 },
				{ canalVendaId: IFOOD, produtoVarianteId: V1, disponivel: true, precoVenda: null },
			],
		},
	]);
});

test("um rascunho idêntico ao carregado produz patch vazio, mesmo com células 'herda' explícitas", () => {
	const baseline = buildMatrixCellMap([{ produtoId: P1, canalVendaId: POS, produtoVarianteId: null, disponivel: true, precoVenda: null }]);
	const draft = new Map(baseline);
	draft.set(matrixNodeKey(P2, POS, null), { disponivel: null, precoVenda: null });
	assert.deepEqual(diffMatrixCells({ baseline, draft }), []);
});

test("o diff de canais só inclui os campos que mudaram", () => {
	const baseline = new Map([
		[POS, { catalogoModo: "TODOS" as const, ordemProdutos: [], ordemGrupos: ["A", "B"] }],
		[IFOOD, { catalogoModo: "SELECIONADOS" as const, ordemProdutos: [], ordemGrupos: [] }],
	]);
	const draft = new Map([
		[POS, { catalogoModo: "SELECIONADOS" as const, ordemProdutos: [], ordemGrupos: ["A", "B"] }],
		[IFOOD, { catalogoModo: "SELECIONADOS" as const, ordemProdutos: [], ordemGrupos: ["X"] }],
	]);
	assert.deepEqual(diffMatrixChannels({ baseline, draft }), [
		{ canalVendaId: POS, catalogoModo: "SELECIONADOS" },
		{ canalVendaId: IFOOD, ordemGrupos: ["X"] },
	]);
});

test("só produtos que tocaram um canal iFood entram no push", () => {
	const patches = [
		{ produtoId: P1, settings: [{ canalVendaId: POS, produtoVarianteId: null, disponivel: false }] },
		{ produtoId: P2, settings: [{ canalVendaId: IFOOD, produtoVarianteId: null, precoVenda: 9 }] },
	];
	assert.deepEqual(productsTouchingChannels(patches, new Set([IFOOD])), [P2]);
});

test("grupos seguem a ordem do canal, com a cauda alfabética e 'Outros' por último", () => {
	const groups = groupMatrixProducts(
		[
			{ id: "Zebra", nome: "Zebra", grupo: "" },
			{ id: "Coxinha", nome: "Coxinha", grupo: "Salgados" },
			{ id: "Brigadeiro", nome: "Brigadeiro", grupo: "Doces" },
			{ id: "Água", nome: "Água", grupo: "Bebidas" },
			{ id: "Bolo", nome: "Bolo", grupo: "Doces" },
		],
		["Doces"],
	);
	assert.deepEqual(
		groups.map((group) => [group.key, group.produtos.map((produto) => produto.nome)]),
		[
			["Doces", ["Bolo", "Brigadeiro"]],
			["Bebidas", ["Água"]],
			["Salgados", ["Coxinha"]],
			["", ["Zebra"]],
		],
	);
	assert.equal(groups.at(-1)?.ungrouped, true);
});

test("mover um grupo materializa a ordem exibida inteira", () => {
	assert.deepEqual(moveGroupInOrder({ displayed: ["A", "B", "C"], grupo: "C", direction: "up" }), ["A", "C", "B"]);
	assert.equal(moveGroupInOrder({ displayed: ["A", "B", "C"], grupo: "A", direction: "up" }), null);
	assert.equal(moveGroupInOrder({ displayed: ["A", "B"], grupo: "Z", direction: "down" }), null);
});

test("renomear para um grupo existente funde as duas entradas na primeira posição", () => {
	assert.deepEqual(renameGroupInOrder(["A", "B", "C"], "C", "A"), ["A", "B"]);
	assert.deepEqual(renameGroupInOrder(["A", "B"], "B", "D"), ["A", "D"]);
});

test("produto se move sem alterar ordem dos demais grupos e materializa a cauda", () => {
	assert.deepEqual(moveProductInOrder({ ordemProdutos: ["a", "x", "b", "y"], displayed: ["a", "b", "c"], produtoId: "c", direction: "up" }), [
		"a",
		"x",
		"c",
		"y",
		"b",
	]);
	assert.equal(moveProductInOrder({ ordemProdutos: [], displayed: ["a"], produtoId: "a", direction: "up" }), null);
});
test("ordem de produtos é patch independente por canal e aceita reset", () => {
	const baseline = new Map([
		[POS, { catalogoModo: "TODOS" as const, ordemGrupos: [], ordemProdutos: ["a"] }],
		[IFOOD, { catalogoModo: "TODOS" as const, ordemGrupos: [], ordemProdutos: [] }],
	]);
	const draft = new Map(baseline);
	draft.set(POS, { ...baseline.get(POS)!, ordemProdutos: [] });
	assert.deepEqual(diffMatrixChannels({ baseline, draft }), [{ canalVendaId: POS, ordemProdutos: [] }]);
	assert.deepEqual(baseline.get(POS)?.ordemProdutos, ["a"]);
});
test("ordem de produtos vale dentro do grupo, inclusive Outros, ignorando IDs órfãos", () => {
	const products = [
		{ id: "a", nome: "Água", grupo: "Bebidas" },
		{ id: "b", nome: "Suco", grupo: "Bebidas" },
		{ id: "c", nome: "Bolo", grupo: "Doces" },
		{ id: "d", nome: "Outro", grupo: "" },
	];
	const groups = groupMatrixProducts(products, ["Doces"], ["missing", "b", "d", "c"]);
	assert.deepEqual(
		groups.map((g) => g.produtos.map((p) => p.id)),
		[["c"], ["b", "a"], ["d"]],
	);
	assert.deepEqual(
		products.map((p) => p.id),
		["a", "b", "c", "d"],
	);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	buildMatrixCellMap,
	diffMatrixCells,
	diffMatrixChannels,
	groupMatrixProducts,
	matrixNodeKey,
	moveGroupInOrder,
	parseMatrixNodeKey,
	productsTouchingChannels,
	renameGroupInOrder,
} from "./sales-channels-matrix";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IFOOD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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
		[POS, { catalogoModo: "TODOS" as const, ordemGrupos: ["A", "B"] }],
		[IFOOD, { catalogoModo: "SELECIONADOS" as const, ordemGrupos: [] }],
	]);
	const draft = new Map([
		[POS, { catalogoModo: "SELECIONADOS" as const, ordemGrupos: ["A", "B"] }],
		[IFOOD, { catalogoModo: "SELECIONADOS" as const, ordemGrupos: ["X"] }],
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
			{ nome: "Zebra", grupo: "" },
			{ nome: "Coxinha", grupo: "Salgados" },
			{ nome: "Brigadeiro", grupo: "Doces" },
			{ nome: "Água", grupo: "Bebidas" },
			{ nome: "Bolo", grupo: "Doces" },
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

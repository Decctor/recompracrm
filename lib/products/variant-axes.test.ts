import assert from "node:assert/strict";
import test from "node:test";
import {
	buildVariantAxes,
	resolveAxisValuePrice,
	fillSingleChoices,
	findVariantIdsForValue,
	resolveSelectedVariantId,
	selectAxisValue,
	selectionFromVariant,
	type TVariantAxisVariantInput,
} from "./variant-axes";

// "Conjunto moletom canguru 2": 5 cores × 3 tamanhos, mas só 13 variantes (Bege só em G, Vermelho sem P).
const options = [
	{
		id: "tam",
		nome: "Tamanho",
		ordem: 1,
		valores: [
			{ id: "p", nome: "P", ordem: 0 },
			{ id: "m", nome: "M", ordem: 1 },
			{ id: "g", nome: "G", ordem: 2 },
		],
	},
	{
		id: "cor",
		nome: "Cor",
		ordem: 0,
		valores: [
			{ id: "bege", nome: "Bege", valorAuxiliar: "#F5B96A", ordem: 0 },
			{ id: "marrom", nome: "Marrom", valorAuxiliar: null, ordem: 1 },
			{ id: "off", nome: "Off", ordem: 2 },
			{ id: "preto", nome: "Preto", ordem: 3 },
			{ id: "vermelho", nome: "Vermelho", ordem: 4 },
			{ id: "verde", nome: "Verde", ordem: 5 },
		],
	},
];

const combos: [string, string][] = [
	["bege", "g"],
	["marrom", "p"],
	["marrom", "m"],
	["marrom", "g"],
	["off", "p"],
	["off", "m"],
	["off", "g"],
	["preto", "p"],
	["preto", "m"],
	["preto", "g"],
	["vermelho", "m"],
	["vermelho", "g"],
	["vermelho", "p"],
];
const variants: TVariantAxisVariantInput[] = combos.map(([cor, tam]) => ({
	id: `${cor}-${tam}`,
	imagemCapaUrl: cor === "marrom" && tam === "m" ? "https://img/marrom.jpg" : null,
	valoresOpcoes: [
		{ opcaoId: "cor", opcaoValorId: cor },
		{ opcaoId: "tam", opcaoValorId: tam },
	],
}));

const axes = buildVariantAxes({ options, variants })!;

test("eixos na ordem do cadastro, só com valores usados", () => {
	assert.deepEqual(
		axes.axes.map((axis) => [axis.nome, axis.values.map((value) => value.nome)]),
		[
			["Cor", ["Bege", "Marrom", "Off", "Preto", "Vermelho"]],
			["Tamanho", ["P", "M", "G"]],
		],
	);
});

test("swatch vem do hex, foto vem da primeira variante da cor que tem foto", () => {
	const cor = axes.axes[0];
	assert.equal(cor.values[0].swatch, "#F5B96A");
	assert.equal(cor.values[1].swatch, null);
	assert.equal(cor.values[1].imageUrl, "https://img/marrom.jpg");
	assert.equal(cor.values[2].imageUrl, null);
});

test("variante resolvida só com todos os eixos escolhidos", () => {
	assert.equal(resolveSelectedVariantId(axes, { cor: "preto" }), null);
	assert.equal(resolveSelectedVariantId(axes, { cor: "preto", tam: "m" }), "preto-m");
});

test("valor sem combinação com o resto não forma variante", () => {
	assert.deepEqual(findVariantIdsForValue(axes, { cor: "bege" }, "tam", "p"), []);
	assert.deepEqual(findVariantIdsForValue(axes, { cor: "bege" }, "tam", "g"), ["bege-g"]);
});

test("escolher em qualquer ordem: tamanho primeiro, cor depois", () => {
	let selection = selectAxisValue(axes, {}, "tam", "m");
	selection = selectAxisValue(axes, selection, "cor", "off");
	assert.equal(resolveSelectedVariantId(axes, selection), "off-m");
});

test("escolha que não combina limpa o eixo conflitante", () => {
	// P escolhido; Bege não existe em P: Bege fica, P sai — e G, a única saída de Bege, entra sozinho.
	const selection = selectAxisValue(axes, { tam: "p" }, "cor", "bege");
	assert.deepEqual(selection, { cor: "bege", tam: "g" });
	assert.equal(resolveSelectedVariantId(axes, selection), "bege-g");
});

test("escolha compatível preserva o outro eixo", () => {
	assert.deepEqual(selectAxisValue(axes, { tam: "p", cor: "marrom" }, "cor", "preto"), { cor: "preto", tam: "p" });
});

test("eixo com um único valor já vem escolhido", () => {
	const single = buildVariantAxes({
		options: [
			{ id: "cor", nome: "Cor", ordem: 0, valores: [{ id: "azul", nome: "Azul", ordem: 0 }] },
			{
				id: "tam",
				nome: "Tamanho",
				ordem: 1,
				valores: [
					{ id: "p", nome: "P", ordem: 0 },
					{ id: "g", nome: "G", ordem: 1 },
				],
			},
		],
		variants: ["p", "g"].map((tam) => ({
			id: `azul-${tam}`,
			valoresOpcoes: [
				{ opcaoId: "cor", opcaoValorId: "azul" },
				{ opcaoId: "tam", opcaoValorId: tam },
			],
		})),
	})!;
	assert.deepEqual(fillSingleChoices(single, {}), { cor: "azul" });
});

test("variante do código de barras preenche todos os eixos", () => {
	assert.deepEqual(selectionFromVariant(axes, "vermelho-g"), { cor: "vermelho", tam: "g" });
	assert.deepEqual(selectionFromVariant(axes, "outra"), {});
	assert.deepEqual(selectionFromVariant(axes, null), {});
});

test("sem eixos, variante sem valor ou combinação repetida caem na lista plana", () => {
	assert.equal(buildVariantAxes({ options: [], variants }), null);
	assert.equal(buildVariantAxes({ options, variants: [...variants, { id: "sem-eixo", valoresOpcoes: [] }] }), null);
	assert.equal(buildVariantAxes({ options, variants: [...variants, { ...variants[0], id: "duplicada" }] }), null);
});

test("eixo cadastrado e não usado por nenhuma variante não vira pergunta", () => {
	const withUnused = buildVariantAxes({
		options: [...options, { id: "material", nome: "Material", ordem: 2, valores: [{ id: "algodao", nome: "Algodão", ordem: 0 }] }],
		variants,
	})!;
	assert.deepEqual(
		withUnused.axes.map((axis) => axis.nome),
		["Cor", "Tamanho"],
	);
});

test("preço do valor: único, a partir de, ou nenhum quando o produto tem preço só", () => {
	assert.equal(resolveAxisValuePrice({ candidatePrices: [189.9], allPrices: [189.9, 189.9] }), null);
	assert.deepEqual(resolveAxisValuePrice({ candidatePrices: [199.9, 199.9], allPrices: [189.9, 199.9] }), { amount: 199.9, isMinimum: false });
	assert.deepEqual(resolveAxisValuePrice({ candidatePrices: [199.9, 189.9], allPrices: [189.9, 199.9] }), { amount: 189.9, isMinimum: true });
	assert.equal(resolveAxisValuePrice({ candidatePrices: [], allPrices: [189.9, 199.9] }), null);
});

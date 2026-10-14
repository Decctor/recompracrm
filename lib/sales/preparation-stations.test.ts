import assert from "node:assert/strict";
import test from "node:test";
import {
	PREPARATION_RULE_SPECIFICITY,
	resolvePreparationStation,
	splitPreparationTicketByStation,
	type TPreparationStationInput,
	type TPreparationStationRuleInput,
} from "./preparation-stations";

function station(overrides: Partial<TPreparationStationInput> & { id: string }): TPreparationStationInput {
	return { ordem: 0, ativa: true, padrao: false, escopoTicket: "PEDIDO", ...overrides };
}

const cozinha = station({ id: "cozinha", ordem: 1, padrao: true });
const bar = station({ id: "bar", ordem: 0 });

const rules: TPreparationStationRuleInput[] = [
	{ estacaoId: "bar", valor: { criterio: "GRUPO", grupo: "Bebidas" } },
	// Milkshake é "Bebidas", mas é batido na cozinha.
	{ estacaoId: "cozinha", valor: { criterio: "PRODUTO", produtoId: "milkshake" } },
];

const refri = { produtoId: "refri", grupo: "Bebidas", nome: "Refrigerante" };
const milkshake = { produtoId: "milkshake", grupo: "Bebidas", nome: "Milkshake" };
const burger = { produtoId: "burger", grupo: "Lanches", nome: "X-Burger" };

test("precedência é PRODUTO antes de GRUPO", () => {
	assert.deepEqual(PREPARATION_RULE_SPECIFICITY, ["PRODUTO", "GRUPO"]);
	assert.equal(resolvePreparationStation({ item: milkshake, rules, stations: [cozinha, bar] })?.id, "cozinha");
	assert.equal(resolvePreparationStation({ item: refri, rules, stations: [cozinha, bar] })?.id, "bar");
});

test("grupo compara sem diferenciar caixa nem espaços", () => {
	assert.equal(resolvePreparationStation({ item: { produtoId: "x", grupo: "  bebidas " }, rules, stations: [cozinha, bar] })?.id, "bar");
});

test("item sem regra vai para a estação padrão", () => {
	assert.equal(resolvePreparationStation({ item: burger, rules, stations: [cozinha, bar] })?.id, "cozinha");
	assert.equal(resolvePreparationStation({ item: { produtoId: null, grupo: null }, rules, stations: [cozinha, bar] })?.id, "cozinha");
});

test("sem padrão, item sem regra vai para a primeira estação ativa por ordem", () => {
	const stations = [station({ id: "a", ordem: 2 }), station({ id: "b", ordem: 1 }), station({ id: "c", ordem: 0, ativa: false })];
	assert.equal(resolvePreparationStation({ item: burger, rules: [], stations })?.id, "b");
});

test("estação inativa nunca recebe itens: a regra dela é ignorada", () => {
	const barInativo = station({ id: "bar", ordem: 0, ativa: false });
	assert.equal(resolvePreparationStation({ item: refri, rules, stations: [cozinha, barInativo] })?.id, "cozinha");
	const split = splitPreparationTicketByStation({ itens: [refri, burger], rules, stations: [cozinha, barInativo] });
	assert.deepEqual(
		split.map((entry) => entry.estacao.id),
		["cozinha"],
	);
});

test("padrão inativa não recebe itens; cai na primeira ativa", () => {
	const cozinhaInativa = station({ id: "cozinha", ordem: 1, padrao: true, ativa: false });
	assert.equal(resolvePreparationStation({ item: burger, rules, stations: [cozinhaInativa, bar] })?.id, "bar");
});

test("escopo PEDIDO: cada estação recebe o pedido inteiro com destaque nos seus itens", () => {
	const split = splitPreparationTicketByStation({ itens: [burger, refri, milkshake], rules, stations: [cozinha, bar] });
	assert.deepEqual(
		split.map((entry) => entry.estacao.id),
		["bar", "cozinha"],
	);
	assert.deepEqual(
		split[0].itens.map((item) => [item.produtoId, item.destaque]),
		[
			["burger", false],
			["refri", true],
			["milkshake", false],
		],
	);
	assert.deepEqual(
		split[1].itens.map((item) => [item.produtoId, item.destaque]),
		[
			["burger", true],
			["refri", false],
			["milkshake", true],
		],
	);
	// Preserva os campos do item de entrada.
	assert.equal(split[0].itens[1].nome, "Refrigerante");
});

test("escopo ESTACAO: a estação recebe só os seus itens, todos em destaque", () => {
	const barSo = station({ id: "bar", ordem: 0, escopoTicket: "ESTACAO" });
	const split = splitPreparationTicketByStation({ itens: [burger, refri, milkshake], rules, stations: [cozinha, barSo] });
	assert.deepEqual(
		split[0].itens.map((item) => [item.produtoId, item.destaque]),
		[["refri", true]],
	);
	assert.equal(split[1].itens.length, 3);
});

test("pedido só de uma estação gera uma única entrada", () => {
	const split = splitPreparationTicketByStation({ itens: [refri], rules, stations: [cozinha, bar] });
	assert.equal(split.length, 1);
	assert.equal(split[0].estacao.id, "bar");
	assert.deepEqual(
		split[0].itens.map((item) => item.destaque),
		[true],
	);
});

test("organização sem estação (ou só com inativas) devolve []", () => {
	assert.deepEqual(splitPreparationTicketByStation({ itens: [refri, burger], rules: [], stations: [] }), []);
	assert.deepEqual(splitPreparationTicketByStation({ itens: [refri], rules, stations: [station({ id: "x", ativa: false })] }), []);
	assert.equal(resolvePreparationStation({ item: refri, rules: [], stations: [] }), null);
});

test("pedido vazio não gera ticket", () => {
	assert.deepEqual(splitPreparationTicketByStation({ itens: [], rules, stations: [cozinha, bar] }), []);
});

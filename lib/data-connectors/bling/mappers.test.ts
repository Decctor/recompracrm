import assert from "node:assert/strict";
import test from "node:test";
import { classifyBlingSaleSituacao, mapBlingSaleToCanonicalSale } from "./mappers";
import type { TBlingSale } from "./types";

function makeSale(situacao: TBlingSale["situacao"]): TBlingSale {
	return {
		id: 101,
		numero: "55",
		numeroLoja: null,
		data: "2026-11-21",
		dataSaida: null,
		dataPrevista: null,
		totalProdutos: 100,
		total: 100,
		outrasDespesas: 0,
		observacoes: null,
		contato: null,
		situacao,
		itens: [],
	} as TBlingSale;
}

const VALID = { isValidSale: true, isCanceled: false };
const CANCELED = { isValidSale: false, isCanceled: true };
const NEITHER = { isValidSale: false, isCanceled: false };

test("Atendido (valor 1, id 9) é venda válida — o detalhe não traz o nome", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 9, valor: 1, nome: null }), VALID);
});

test("situação personalizada derivada de Atendido (valor 1, outro id) é válida", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 4545, valor: 1, nome: null }), VALID);
});

test("Em aberto padrão (id 6) é válida; personalizada derivada de Em aberto não", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 6, valor: 0, nome: null }), VALID);
	assert.deepEqual(classifyBlingSaleSituacao({ id: 7777, valor: 0, nome: null }), NEITHER);
});

test("Cancelado (valor 2, id 12) é cancelamento", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 12, valor: 2, nome: null }), CANCELED);
	assert.deepEqual(classifyBlingSaleSituacao({ id: 9999, valor: 2, nome: null }), CANCELED);
});

test("Em digitação (valor 10, id 21) e outras situações não são válidas nem canceladas", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 21, valor: 10, nome: null }), NEITHER);
	assert.deepEqual(classifyBlingSaleSituacao({ id: 15, valor: 3, nome: null }), NEITHER);
});

test("sem valor, as situações padrão são reconhecidas pelo id", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: 9, valor: null, nome: null }), VALID);
	assert.deepEqual(classifyBlingSaleSituacao({ id: 12, valor: null, nome: null }), CANCELED);
	assert.deepEqual(classifyBlingSaleSituacao({ id: 6, valor: null, nome: null }), VALID);
});

test("sem números, o nome decide", () => {
	assert.deepEqual(classifyBlingSaleSituacao({ id: null, valor: null, nome: "Atendido" }), VALID);
	assert.deepEqual(classifyBlingSaleSituacao({ id: null, valor: null, nome: "Cancelado" }), CANCELED);
	assert.deepEqual(classifyBlingSaleSituacao({ id: null, valor: null, nome: "Em digitação" }), NEITHER);
	assert.deepEqual(classifyBlingSaleSituacao(null), NEITHER);
});

test("venda canônica: Atendido vira válida e mantém o texto de situação gravado", () => {
	const sale = mapBlingSaleToCanonicalSale({ sale: makeSale({ id: 9, valor: 1, nome: null }) });
	assert.equal(sale.isValidSale, true);
	assert.equal(sale.isCanceled, false);
	assert.equal(sale.nature, "SN01");
	assert.equal(sale.statusText, "1 - 9");
});

test("venda canônica: Cancelado vira cancelada", () => {
	const sale = mapBlingSaleToCanonicalSale({ sale: makeSale({ id: 12, valor: 2, nome: null }) });
	assert.equal(sale.isValidSale, false);
	assert.equal(sale.isCanceled, true);
});

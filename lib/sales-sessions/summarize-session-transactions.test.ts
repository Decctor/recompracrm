import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSessionTransactions } from "./summarize-session-transactions";

test("cash sale of 66 with 100 tendered and 34 change leaves 466 in the drawer", () => {
	const [cash] = summarizeSessionTransactions(
		[
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 100 },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 34, modificadoresMetadata: { origem: "TROCO" } },
		],
		400,
	);
	assert.deepEqual(
		{ ...cash, detalhamento: undefined },
		{ metodo: "DINHEIRO", valorEsperado: 466, entradas: 100, troco: 34, outrasSaidas: 0, pendenteEfetivacao: 0, detalhamento: undefined },
	);
	assert.equal(cash.detalhamento.troco, 34);
});

test("card receipt stays separate from cash change: 400 minus 12 equals 388", () => {
	const [cash, card] = summarizeSessionTransactions(
		[
			{ metodo: "CARTAO_DEBITO", tipo: "ENTRADA", valor: 66 },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 12, modificadoresMetadata: { origem: "TROCO" } },
		],
		400,
	);
	assert.equal(cash.valorEsperado, 388);
	assert.equal(cash.troco, 12);
	assert.equal(card.valorEsperado, 66);
});

test("card-only sale does not increase or decrease the drawer", () => {
	const [cash] = summarizeSessionTransactions([{ metodo: "CARTAO_DEBITO", tipo: "ENTRADA", valor: 66 }], 400);
	assert.equal(cash.valorEsperado, 400);
	assert.equal(cash.troco, 0);
});

test("supply, withdrawal and refund reconcile without subtracting change twice", () => {
	const [cash] = summarizeSessionTransactions(
		[
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 100 },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 34, modificadoresMetadata: { origem: "TROCO" } },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 66 },
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 50 },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 20 },
		],
		400,
	);
	assert.deepEqual(
		{ ...cash, detalhamento: undefined },
		{ metodo: "DINHEIRO", valorEsperado: 430, entradas: 150, troco: 34, outrasSaidas: 86, pendenteEfetivacao: 0, detalhamento: undefined },
	);
});

test("empty drawer still requires reconciliation and decimal values stay exact", () => {
	assert.equal(summarizeSessionTransactions([], 0)[0].valorEsperado, 0);
	const [cash] = summarizeSessionTransactions(
		[
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 0.1 },
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 0.2 },
		],
		0,
	);
	assert.equal(cash.valorEsperado, 0.3);
});

test("pending receivables stay in the expected total but are reported separately", () => {
	const [, card] = summarizeSessionTransactions(
		[
			{ metodo: "CARTAO_CREDITO", tipo: "ENTRADA", valor: 120, dataEfetivacao: null },
			{ metodo: "CARTAO_CREDITO", tipo: "ENTRADA", valor: 30, dataEfetivacao: new Date("2026-08-19T14:00:00.000Z") },
			// Linhas sem a coluna (chamadores antigos) não contam como pendentes.
			{ metodo: "CARTAO_CREDITO", tipo: "ENTRADA", valor: 10 },
		],
		0,
	);
	assert.equal(card.valorEsperado, 160);
	assert.equal(card.entradas, 160);
	assert.equal(card.pendenteEfetivacao, 120);
});

test("drawer breakdown splits sales, supply, withdrawals, expenses and refunds by accounting origin", () => {
	// Turno real: 9 vendas em dinheiro (451), troco 31, suprimento 112 e sangrias de 84 e 447,05.
	const [cash] = summarizeSessionTransactions(
		[
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 112, origemTipo: "TRANSFERENCIA" },
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 351, origemTipo: "VENDA" },
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 100, origemTipo: "VENDA" },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 31, origemTipo: "VENDA", modificadoresMetadata: { origem: "TROCO" } },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 84, origemTipo: "TRANSFERENCIA" },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 447.05, origemTipo: "TRANSFERENCIA" },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 20, origemTipo: "MANUAL" },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 15, origemTipo: "ESTORNO" },
		],
		400,
	);
	assert.deepEqual(cash.detalhamento, {
		vendas: 451,
		suprimentos: 112,
		demaisEntradas: 0,
		troco: 31,
		sangrias: 531.05,
		despesas: 20,
		estornos: 15,
		demaisSaidas: 0,
	});
	assert.equal(cash.valorEsperado, 365.95);
	assert.equal(cash.outrasSaidas, 566.05);
});

test("rows without accounting origin fall into the catch-all buckets and still reconcile", () => {
	const [cash] = summarizeSessionTransactions(
		[
			{ metodo: "DINHEIRO", tipo: "ENTRADA", valor: 10 },
			{ metodo: "DINHEIRO", tipo: "SAIDA", valor: 4 },
		],
		0,
	);
	assert.equal(cash.detalhamento.demaisEntradas, 10);
	assert.equal(cash.detalhamento.demaisSaidas, 4);
	assert.equal(cash.valorEsperado, 6);
});

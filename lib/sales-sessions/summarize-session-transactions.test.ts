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
	assert.deepEqual(cash, { metodo: "DINHEIRO", valorEsperado: 466, entradas: 100, troco: 34, outrasSaidas: 0, pendenteEfetivacao: 0 });
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
	assert.deepEqual(cash, { metodo: "DINHEIRO", valorEsperado: 430, entradas: 150, troco: 34, outrasSaidas: 86, pendenteEfetivacao: 0 });
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

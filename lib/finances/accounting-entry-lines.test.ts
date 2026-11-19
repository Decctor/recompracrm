import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assertAccountingEntryLinesBalanced,
	buildDefaultAccountingEntryLines,
	buildPurchaseAccountingEntryLines,
	buildReversalAccountingEntryLines,
} from "./accounting-entry-lines";

test("lançamento simples gera um débito e um crédito balanceados", () => {
	const lines = buildDefaultAccountingEntryLines({ debitAccountId: "estoque", creditAccountId: "fornecedores", value: 100 });
	assert.equal(lines.length, 2);
	assert.doesNotThrow(() => assertAccountingEntryLinesBalanced({ entryValue: 100, lines }));
});

test("compra separa estoque, crédito tributário e despesa pelas contas configuradas", () => {
	const lines = buildPurchaseAccountingEntryLines({
		amounts: { valorFinanceiro: 123, valorCustoEstoque: 110, valorCreditoTributario: 8, valorDespesaPeriodo: 5 },
		accounts: {
			estoqueContaId: "estoque",
			creditoTributarioContaId: "tributos",
			despesaPeriodoContaId: "despesas",
			fornecedoresContaId: "fornecedores",
		},
	});
	assert.deepEqual(
		lines.map((line) => [line.natureza, line.contaContabilId, line.valor]),
		[
			["DEBITO", "estoque", 110],
			["DEBITO", "tributos", 8],
			["DEBITO", "despesas", 5],
			["CREDITO", "fornecedores", 123],
		],
	);
});

test("tratamento com valor exige sua conta contábil", () => {
	assert.throws(
		() =>
			buildPurchaseAccountingEntryLines({
				amounts: { valorFinanceiro: 108, valorCustoEstoque: 100, valorCreditoTributario: 8, valorDespesaPeriodo: 0 },
				accounts: { estoqueContaId: "estoque", fornecedoresContaId: "fornecedores" },
			}),
		/Conta contábil não configurada/,
	);
});

test("linhas desbalanceadas são rejeitadas", () => {
	assert.throws(
		() =>
			assertAccountingEntryLinesBalanced({
				entryValue: 100,
				lines: [
					{ contaContabilId: "a", natureza: "DEBITO", valor: 100 },
					{ contaContabilId: "b", natureza: "CREDITO", valor: 99 },
				],
			}),
		/não estão balanceadas/,
	);
});

const summarize = (lines: { natureza: string; contaContabilId: string; valor: number }[]) =>
	lines.map((line) => [line.natureza, line.contaContabilId, line.valor]);

test("itens com destino próprio debitam a conta escolhida, separados do estoque", () => {
	const lines = buildPurchaseAccountingEntryLines({
		amounts: {
			valorFinanceiro: 1000,
			valorCustoEstoque: 800,
			valorCreditoTributario: 0,
			valorDespesaPeriodo: 0,
			custosPorDestino: [
				{ contaContabilId: "manutencao", valor: 150 },
				{ contaContabilId: "benfeitorias", valor: 50 },
			],
		},
		accounts: { estoqueContaId: "estoque", fornecedoresContaId: "fornecedores" },
	});
	assert.deepEqual(summarize(lines), [
		["DEBITO", "estoque", 800],
		["DEBITO", "manutencao", 150],
		["DEBITO", "benfeitorias", 50],
		["CREDITO", "fornecedores", 1000],
	]);
});

test("compra só de destino próprio não gera linha de estoque", () => {
	const lines = buildPurchaseAccountingEntryLines({
		amounts: {
			valorFinanceiro: 300,
			valorCustoEstoque: 0,
			valorCreditoTributario: 0,
			valorDespesaPeriodo: 0,
			custosPorDestino: [{ contaContabilId: "manutencao", valor: 300 }],
		},
		accounts: { estoqueContaId: "estoque", fornecedoresContaId: "fornecedores" },
	});
	assert.deepEqual(summarize(lines), [
		["DEBITO", "manutencao", 300],
		["CREDITO", "fornecedores", 300],
	]);
});

test("estorno inverte cada linha de uma partida composta", () => {
	const { entryValue, lines } = buildReversalAccountingEntryLines({
		lines: [
			{ contaContabilId: "estoque", natureza: "DEBITO", valor: 800 },
			{ contaContabilId: "manutencao", natureza: "DEBITO", valor: 200 },
			{ contaContabilId: "fornecedores", natureza: "CREDITO", valor: 1000 },
		],
	});
	assert.equal(entryValue, 1000);
	assert.deepEqual(summarize(lines), [
		["CREDITO", "estoque", 800],
		["CREDITO", "manutencao", 200],
		["DEBITO", "fornecedores", 1000],
	]);
});

test("estorno com valor retido reconhece a parte não devolvida na conta informada", () => {
	const { entryValue, lines } = buildReversalAccountingEntryLines({
		lines: [
			{ contaContabilId: "estoque", natureza: "DEBITO", valor: 1000 },
			{ contaContabilId: "fornecedores", natureza: "CREDITO", valor: 1000 },
		],
		retained: { contaContabilId: "perdas", valor: 400, descricao: "Perda no cancelamento" },
	});
	assert.equal(entryValue, 1000);
	assert.deepEqual(summarize(lines), [
		["CREDITO", "estoque", 1000],
		["DEBITO", "fornecedores", 600],
		["DEBITO", "perdas", 400],
	]);
});

test("estorno retendo o valor inteiro não devolve nada à contrapartida", () => {
	const { lines } = buildReversalAccountingEntryLines({
		lines: [
			{ contaContabilId: "manutencao", natureza: "DEBITO", valor: 300 },
			{ contaContabilId: "fornecedores", natureza: "CREDITO", valor: 300 },
		],
		retained: { contaContabilId: "perdas", valor: 300, descricao: "Perda no cancelamento" },
	});
	assert.deepEqual(summarize(lines), [
		["CREDITO", "manutencao", 300],
		["DEBITO", "perdas", 300],
	]);
});

test("estorno recusa reter mais que o valor do lançamento", () => {
	assert.throws(
		() =>
			buildReversalAccountingEntryLines({
				lines: [
					{ contaContabilId: "estoque", natureza: "DEBITO", valor: 100 },
					{ contaContabilId: "fornecedores", natureza: "CREDITO", valor: 100 },
				],
				retained: { contaContabilId: "perdas", valor: 100.01, descricao: "x" },
			}),
		/não pode passar do valor/,
	);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAccountingEntryLinesBalanced, buildDefaultAccountingEntryLines, buildPurchaseAccountingEntryLines } from "./accounting-entry-lines";

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

test("compra abre o custo por destinação em contas próprias e mantém revenda na conta de estoque", () => {
	const lines = buildPurchaseAccountingEntryLines({
		amounts: {
			valorFinanceiro: 150,
			valorCustoEstoque: 150,
			custoPorDestinacao: { REVENDA: 100, INSUMO: 30, USO_CONSUMO: 20 },
			valorCreditoTributario: 0,
			valorDespesaPeriodo: 0,
		},
		accounts: {
			estoqueContaId: "estoque",
			fornecedoresContaId: "fornecedores",
			contasPorDestinacao: { INSUMO: "estoque-insumos", USO_CONSUMO: "despesa-consumo" },
		},
	});
	assert.deepEqual(
		lines.map((line) => [line.natureza, line.contaContabilId, line.valor]),
		[
			["DEBITO", "estoque", 100],
			["DEBITO", "estoque-insumos", 30],
			["DEBITO", "despesa-consumo", 20],
			["CREDITO", "fornecedores", 150],
		],
	);
});

test("compra com destinação sem conta configurada falha apontando onde configurar", () => {
	assert.throws(
		() =>
			buildPurchaseAccountingEntryLines({
				amounts: {
					valorFinanceiro: 20,
					valorCustoEstoque: 20,
					custoPorDestinacao: { USO_CONSUMO: 20 },
					valorCreditoTributario: 0,
					valorDespesaPeriodo: 0,
				},
				accounts: { estoqueContaId: "estoque", fornecedoresContaId: "fornecedores" },
			}),
		/Material de uso e consumo da compra/i,
	);
});

test("abertura por destinação que não fecha com o custo total é recusada", () => {
	assert.throws(
		() =>
			buildPurchaseAccountingEntryLines({
				amounts: { valorFinanceiro: 100, valorCustoEstoque: 100, custoPorDestinacao: { REVENDA: 90 }, valorCreditoTributario: 0, valorDespesaPeriodo: 0 },
				accounts: { estoqueContaId: "estoque", fornecedoresContaId: "fornecedores" },
			}),
		/não fecha/,
	);
});

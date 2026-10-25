import assert from "node:assert/strict";
import { test } from "node:test";
import { allocatePurchaseCostModifier, calculatePurchaseItemCost } from "./costing";

const baseItem = { quantidade: 10, valorTotalBruto: 100 };

test("frete direto aumenta o custo de estoque e o valor financeiro", () => {
	const result = calculatePurchaseItemCost({
		...baseItem,
		modificadoresCusto: {
			versao: 1,
			modificadores: [{ chave: "FRETE", valorCentavos: 1000, efeito: "ACRESCIMO", tratamento: "CUSTO_ESTOQUE", origem: "XML" }],
		},
	});
	assert.equal(result.valorTotalLiquido, 110);
	assert.equal(result.valorTotalCusto, 110);
	assert.equal(result.valorUnitarioCusto, 11);
});

test("imposto recuperável afeta o financeiro e o crédito tributário sem alterar o custo de estoque", () => {
	const result = calculatePurchaseItemCost({
		...baseItem,
		modificadoresCusto: {
			versao: 1,
			modificadores: [
				{
					chave: "IMPOSTOS_IPI",
					valorCentavos: 800,
					efeito: "ACRESCIMO",
					tratamento: "CREDITO_TRIBUTARIO",
					origem: "XML",
				},
			],
		},
	});
	assert.equal(result.valorTotalLiquido, 108);
	assert.equal(result.valorTotalCusto, 100);
	assert.equal(result.valorTotalCreditoTributario, 8);
});

test("imposto não recuperável aumenta o custo de estoque", () => {
	const result = calculatePurchaseItemCost({
		...baseItem,
		modificadoresCusto: {
			versao: 1,
			modificadores: [
				{
					chave: "IMPOSTOS_ICMS_ST",
					valorCentavos: 1200,
					efeito: "ACRESCIMO",
					tratamento: "CUSTO_ESTOQUE",
					origem: "XML",
				},
			],
		},
	});
	assert.equal(result.valorTotalCusto, 112);
});

test("desconto reduz o custo de estoque", () => {
	const result = calculatePurchaseItemCost({
		...baseItem,
		modificadoresCusto: {
			versao: 1,
			modificadores: [{ chave: "DESCONTO", valorCentavos: 500, efeito: "REDUCAO", tratamento: "CUSTO_ESTOQUE", origem: "MANUAL" }],
		},
	});
	assert.equal(result.valorTotalLiquido, 95);
	assert.equal(result.valorTotalCusto, 95);
	assert.equal(result.descontosTotal, 5);
});

test("despesa do período altera o passivo sem alterar o custo médio", () => {
	const result = calculatePurchaseItemCost({
		...baseItem,
		modificadoresCusto: {
			versao: 1,
			modificadores: [
				{
					chave: "DESPESA_ACESSORIA",
					valorCentavos: 500,
					efeito: "ACRESCIMO",
					tratamento: "DESPESA_PERIODO",
					origem: "MANUAL",
				},
			],
		},
	});
	assert.equal(result.valorTotalLiquido, 105);
	assert.equal(result.valorTotalCusto, 100);
	assert.equal(result.valorTotalDespesaPeriodo, 5);
});

test("valores legados são convertidos sem alterar o custo histórico", () => {
	const result = calculatePurchaseItemCost({ ...baseItem, descontosTotal: 5, acrescimosTotal: 2 });
	assert.equal(result.valorTotalLiquido, 97);
	assert.equal(result.valorTotalCusto, 97);
	assert.deepEqual(
		result.modificadoresCusto.modificadores.map((modifier) => modifier.chave),
		["DESCONTO", "OUTRO"],
	);
});

test("rateio por maior resto fecha exatamente em centavos e mantém desempate estável", () => {
	const allocations = allocatePurchaseCostModifier({
		modifier: { chave: "FRETE", valorCentavos: 100, efeito: "ACRESCIMO", tratamento: "CUSTO_ESTOQUE", origem: "XML" },
		method: "PROPORCIONAL_VALOR",
		items: [
			{ referencia: "a", valorBaseCentavos: 1, quantidade: 1 },
			{ referencia: "b", valorBaseCentavos: 1, quantidade: 1 },
			{ referencia: "c", valorBaseCentavos: 1, quantidade: 1 },
		],
	});
	assert.deepEqual(
		allocations.map(({ modificador }) => modificador.valorCentavos),
		[34, 33, 33],
	);
	assert.equal(
		allocations.reduce((total, { modificador }) => total + modificador.valorCentavos, 0),
		100,
	);
});

test("bonificação zera custo e dívida da linha, sem tornar nada negativo", () => {
	const result = calculatePurchaseItemCost({
		quantidade: 10,
		valorTotalBruto: 50,
		modificadoresCusto: {
			versao: 1,
			modificadores: [{ chave: "BONIFICACAO", valorCentavos: 5000, efeito: "REDUCAO", tratamento: "CUSTO_ESTOQUE", origem: "XML" }],
		},
	});
	assert.equal(result.valorTotalLiquido, 0);
	assert.equal(result.valorTotalCusto, 0);
	assert.equal(result.valorUnitarioCusto, 0);
	assert.equal(result.descontosTotal, 50);
});

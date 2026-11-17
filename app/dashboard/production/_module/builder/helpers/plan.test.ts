import assert from "node:assert/strict";
import test from "node:test";
import { buildRecipePlan, getRecipeDefaults, type TBuilderRecipe } from "./plan";

type TSaldo = NonNullable<TBuilderRecipe["saldo"]>;

/** Receita de 10 kg de massa a partir de 8 kg de farinha (R$ 5/kg): custo R$ 40, R$ 4/kg de massa. */
function buildRecipe(saldo: Partial<TSaldo>): TBuilderRecipe {
	return {
		id: "receita",
		titulo: "Massa",
		previsaoTempoValor: null,
		previsaoTempoMedida: null,
		insumos: [
			{ id: "i1", produtoId: "farinha", produtoVarianteId: null, quantidade: 8, produto: { nome: "Farinha", unidade: "KG" }, produtoVariante: null },
		],
		saidas: [
			{ id: "s1", produtoId: "massa", produtoVarianteId: null, quantidade: 10, produto: { nome: "Massa", unidade: "KG" }, produtoVariante: null },
		],
		valores: {
			custoTotal: 40,
			retornoEsperado: 100,
			margem: 60,
			margemPercentual: 60,
			custoCompleto: true,
			retornoCompleto: true,
			origemValores: "CATALOGO",
		},
		saldo: { rastreamentoEstoqueAtivo: true, custoUnitario: null, lotes: [], saldoGeral: 0, ...saldo },
	} as unknown as TBuilderRecipe;
}

const start = new Date("2026-11-15T12:00:00.000Z");
const reinc = (quantidade: number, loteId: string | null = null) => ({
	target: 10,
	reinc: { on: true, quantidade, loteId, modo: "MANTER_RENDIMENTO" as const },
});

test("sem controle de estoque: reincorpora sem saldo conhecido, sem limite e sem lote", () => {
	const recipe = buildRecipe({ rastreamentoEstoqueAtivo: false, custoUnitario: 3, saldoGeral: 0 });
	const plan = buildRecipePlan({ recipe, quantities: reinc(4, "lote-fantasma"), start });

	assert.equal(plan.canReincorporate, true);
	assert.equal(plan.maxSaldo, null);
	assert.equal(plan.escala.quantidadeSaldo, 4);
	assert.equal(plan.lot, null);
	assert.equal(plan.items.entradas[0].reincorporado, true);
	assert.equal(plan.items.entradas[0].loteId, null);
	assert.equal(plan.untrackedLeftover, true);
	assert.equal(plan.untrackedLeftoverWithoutCost, false);
	// Mistura nova para 6 kg (R$ 24) + 4 kg de saldo ao custo de catálogo (R$ 3/kg).
	assert.equal(plan.valores.custoTotal, 24 + 12);
	assert.equal(plan.valores.custoCompleto, true);
});

test("sem controle e sem preço de custo: saldo de graça e custo marcado como incompleto", () => {
	const recipe = buildRecipe({ rastreamentoEstoqueAtivo: false, custoUnitario: null });
	const plan = buildRecipePlan({ recipe, quantities: reinc(4), start });

	assert.equal(plan.untrackedLeftoverWithoutCost, true);
	assert.equal(plan.valores.custoTotal, 24);
	assert.equal(plan.valores.custoCompleto, false);
});

test("sem controle: a reincorporação começa desligada", () => {
	const defaults = getRecipeDefaults(buildRecipe({ rastreamentoEstoqueAtivo: false }));
	assert.equal(defaults.reinc.on, false);
});

test("com controle de estoque: sem saldo não reincorpora, e o saldo geral limita a quantidade", () => {
	assert.equal(buildRecipePlan({ recipe: buildRecipe({ saldoGeral: 0 }), quantities: reinc(4), start }).canReincorporate, false);

	const plan = buildRecipePlan({ recipe: buildRecipe({ saldoGeral: 2.5 }), quantities: reinc(4), start });
	assert.equal(plan.canReincorporate, true);
	assert.equal(plan.maxSaldo, 2.5);
	assert.equal(plan.escala.quantidadeSaldo, 2.5);
	assert.equal(plan.untrackedLeftover, false);
	// Saldo de estoque custeado pelo custo unitário da receita (R$ 4/kg).
	assert.equal(plan.valores.custoTotal, 40 * 0.75 + 2.5 * 4);
});

test("com controle de estoque: o lote escolhido limita a quantidade", () => {
	const lotes = [{ id: "L1", codigoLote: "L1", quantidadeAtual: 1.5, dataValidade: null, dataFabricacao: null }] as TSaldo["lotes"];
	const plan = buildRecipePlan({ recipe: buildRecipe({ lotes, saldoGeral: 5 }), quantities: reinc(4, "L1"), start });
	assert.equal(plan.lot?.id, "L1");
	assert.equal(plan.maxSaldo, 1.5);
	assert.equal(plan.items.entradas[0].loteId, "L1");
});

test("sem permissão de ver custos: custo e margem nulos, sem aviso de custo ausente", () => {
	const base = buildRecipe({ rastreamentoEstoqueAtivo: false, custoUnitario: null });
	const recipe = { ...base, valores: { ...base.valores, custoTotal: null, margem: null, margemPercentual: null } } as unknown as TBuilderRecipe;
	const plan = buildRecipePlan({ recipe, quantities: reinc(4), start });
	assert.equal(plan.untrackedLeftover, true);
	assert.equal(plan.untrackedLeftoverWithoutCost, false);
	assert.equal(plan.valores.custoTotal, null);
	assert.equal(plan.valores.margem, null);
	assert.equal(plan.valores.margemPercentual, null);
	assert.equal(plan.valores.retornoEsperado, 100);
});

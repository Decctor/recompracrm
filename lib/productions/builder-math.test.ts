import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionItemsFromRecipe, scaleRecipe } from "./builder-math";

test("escala sem saldo segue o alvo", () => {
	const scale = scaleRecipe({ rendimentoReceita: 5, alvo: 10 });
	assert.equal(scale.fatorInsumos, 2);
	assert.equal(scale.fatorSaidas, 2);
	assert.equal(scale.quantidadeSaida, 10);
	assert.equal(scale.reducaoInsumos, 0);
	assert.equal(scale.bloqueado, false);
});

test("manter rendimento reduz os insumos na proporção do saldo", () => {
	const scale = scaleRecipe({ rendimentoReceita: 5, alvo: 5, reincorporacao: { quantidade: 1.2, modo: "MANTER_RENDIMENTO" } });
	assert.equal(scale.quantidadeSaida, 5);
	assert.ok(Math.abs(scale.quantidadeMisturaNova - 3.8) < 1e-9);
	assert.ok(Math.abs(scale.fatorInsumos - 0.76) < 1e-9);
	assert.equal(scale.fatorSaidas, 1);
	assert.ok(Math.abs(scale.reducaoInsumos - 0.24) < 1e-9);
	assert.equal(scale.bloqueado, false);
});

test("manter rendimento bloqueia quando o saldo cobre o alvo", () => {
	const scale = scaleRecipe({ rendimentoReceita: 5, alvo: 2, reincorporacao: { quantidade: 2, modo: "MANTER_RENDIMENTO" } });
	assert.equal(scale.bloqueado, true);
	assert.equal(scale.fatorInsumos, 0);
});

test("somar ao rendimento mantém os insumos e aumenta a saída", () => {
	const scale = scaleRecipe({ rendimentoReceita: 5, alvo: 5, reincorporacao: { quantidade: 1.2, modo: "SOMAR_AO_RENDIMENTO" } });
	assert.equal(scale.fatorInsumos, 1);
	assert.ok(Math.abs(scale.quantidadeSaida - 6.2) < 1e-9);
	assert.equal(scale.reducaoInsumos, 0);
});

test("itens previstos trazem a linha de saldo primeiro, ligada ao lote", () => {
	const scale = scaleRecipe({ rendimentoReceita: 5, alvo: 5, reincorporacao: { quantidade: 1.2, modo: "MANTER_RENDIMENTO" } });
	const items = buildProductionItemsFromRecipe({
		insumos: [
			{ produtoId: "base", quantidade: 4.2 },
			{ produtoId: "pasta", quantidade: 0.6 },
		],
		saidas: [{ produtoId: "gelato", quantidade: 5, prazoValidadeMedida: "DIAS", prazoValidadeValor: 15 }],
		escala: scale,
		saldo: { loteId: "lote-1" },
	});
	assert.equal(items.entradas.length, 3);
	assert.deepEqual(
		{
			produtoId: items.entradas[0].produtoId,
			reincorporado: items.entradas[0].reincorporado,
			loteId: items.entradas[0].loteId,
			q: items.entradas[0].quantidadePrevista,
		},
		{ produtoId: "gelato", reincorporado: true, loteId: "lote-1", q: 1.2 },
	);
	assert.equal(items.entradas[1].quantidadePrevista, 3.192);
	assert.equal(items.entradas[2].quantidadePrevista, 0.456);
	assert.equal(items.saidas[0].quantidadePrevista, 5);
	assert.equal(items.saidas[0].quantidadeReal, null);
});

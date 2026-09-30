import assert from "node:assert/strict";
import { test } from "node:test";
import { modifierPricesDiverge, repriceSaleItem, resolveCurrentModifierPrices } from "./sale-item-repricing";

const item = {
	quantidade: 3,
	valorDesconto: 2,
	valorUnitarioBase: 10,
	valorModificadores: 10,
	valorUnitarioFinal: 20,
	valorTotalBruto: 60,
	valorTotalLiquido: 58,
	modificadores: [{ opcaoId: "bebida", nome: "Bebida", quantidade: 2, valorUnitario: 5, valorTotal: 10 }],
};

test("rascunho reprecificado envia preço e total atuais de cada modificador junto dos totais", () => {
	const current = resolveCurrentModifierPrices(item.modificadores, new Map([["bebida", 8]]));
	assert.ok(current);
	const repriced = repriceSaleItem(item, { itemId: "item", valorUnitarioBase: 10, modificadores: current });
	assert.deepEqual(repriced.modificadores, [{ opcaoId: "bebida", nome: "Bebida", quantidade: 2, valorUnitario: 8, valorTotal: 16 }]);
	assert.equal(repriced.valorModificadores, 16);
	assert.equal(repriced.valorUnitarioFinal, 26);
	assert.equal(repriced.valorTotalBruto, 78);
	assert.equal(repriced.valorTotalLiquido, 76);
	assert.equal(item.modificadores[0].valorUnitario, 5);
});

test("opção gratuita zera modificadores e limita desconto ao novo bruto", () => {
	const repriced = repriceSaleItem(
		{ ...item, valorDesconto: 60 },
		{ itemId: "item", valorUnitarioBase: 10, modificadores: [{ opcaoId: "bebida", valorUnitario: 0 }] },
	);
	assert.equal(repriced.modificadores[0].valorTotal, 0);
	assert.equal(repriced.valorTotalBruto, 30);
	assert.equal(repriced.valorDesconto, 30);
	assert.equal(repriced.valorTotalLiquido, 0);
});

test("opção pausada ou excluída torna o preço atual indisponível", () => {
	assert.equal(resolveCurrentModifierPrices(item.modificadores, new Map()), null);
	assert.equal(resolveCurrentModifierPrices([{ opcaoId: null }], new Map()), null);
});

test("recompensa mantém seu snapshot e escolha nova não recebe atualização parcial", () => {
	const price = { itemId: "item", valorUnitarioBase: 10, modificadores: [] };
	const reward = { ...item, recompensaId: "reward" };
	assert.equal(repriceSaleItem(reward, price), reward);
	assert.equal(repriceSaleItem(item, price), item);
});

test("preços de opções que se compensam continuam divergentes até atualizar os snapshots", () => {
	const modifiers = [
		{ opcaoId: "bebida", quantidade: 1, valorUnitario: 5, valorTotal: 5 },
		{ opcaoId: "cobertura", quantidade: 1, valorUnitario: 4, valorTotal: 4 },
	];
	const prices = new Map([
		["bebida", 8],
		["cobertura", 1],
	]);
	assert.equal(modifierPricesDiverge(modifiers, prices), true);
	const current = resolveCurrentModifierPrices(modifiers, prices);
	assert.ok(current);
	const repriced = repriceSaleItem({ ...item, modificadores: modifiers }, { itemId: "item", valorUnitarioBase: 10, modificadores: current });
	assert.equal(repriced.valorModificadores, 9);
	assert.equal(modifierPricesDiverge(repriced.modificadores, prices), false);
});

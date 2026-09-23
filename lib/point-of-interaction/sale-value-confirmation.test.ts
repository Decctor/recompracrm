import assert from "node:assert/strict";
import test from "node:test";
import { addPoiPrizeLine, resolvePoiPrizeLines, setPoiPrizeLineQuantity, sumPoiPrizeSaleValue, sumPoiPrizeValue } from "./prize-lines";
import { getPoiSaleValueForConfirmation, poiSaleRequiresValueConfirmation } from "./sale-value-confirmation";

const cashbackOff = { aplicar: false, valor: 0 };

test("sem recompensa: valor da venda menos o cashback aplicado", () => {
	assert.equal(getPoiSaleValueForConfirmation({ valor: 100, cashback: { aplicar: true, valor: 30 } }), 70);
	assert.equal(getPoiSaleValueForConfirmation({ valor: 100, cashback: cashbackOff }), 100);
	assert.equal(poiSaleRequiresValueConfirmation(true, { valor: 100, cashback: cashbackOff }), true);
});

test("com recompensas: soma comercial menos soma do débito, quantidade incluída", () => {
	const sale = {
		valor: 0,
		cashback: cashbackOff,
		prizeRedemptions: [
			{ prizeId: "a", prizeValue: 50, prizeSaleValue: 8, quantity: 2 },
			{ prizeId: "b", prizeValue: 5, prizeSaleValue: 15, quantity: 1 },
		],
	};
	// bruto 31, débito 105 → nunca negativo
	assert.equal(getPoiSaleValueForConfirmation(sale), 0);
	assert.equal(poiSaleRequiresValueConfirmation(true, sale), false);
	const cheap = { valor: 0, cashback: cashbackOff, prizeRedemptions: [{ prizeId: "b", prizeValue: 5, prizeSaleValue: 15, quantity: 2 }] };
	assert.equal(getPoiSaleValueForConfirmation(cheap), 20);
});

test("formato legado (prizeRedemption singular) vira uma linha de quantidade 1", () => {
	const lines = resolvePoiPrizeLines({ prizeRedemption: { prizeId: "a", prizeValue: 50, prizeSaleValue: 8 } });
	assert.deepEqual(lines, [{ prizeId: "a", prizeValue: 50, prizeSaleValue: 8, quantity: 1 }]);
	assert.deepEqual(resolvePoiPrizeLines({}), []);
	// plural vence e quantidade inválida cai para 1
	assert.deepEqual(resolvePoiPrizeLines({ prizeRedemptions: [{ prizeId: "b", quantity: 0 }], prizeRedemption: { prizeId: "a", prizeValue: 1, prizeSaleValue: 1 } }), [
		{ prizeId: "b", prizeValue: 0, prizeSaleValue: 0, quantity: 1 },
	]);
});

test("adicionar a mesma recompensa incrementa a linha; quantidade < 1 remove", () => {
	let lines = addPoiPrizeLine([], { id: "a", valor: 50, valorVenda: 8 });
	lines = addPoiPrizeLine(lines, { id: "a", valor: 50, valorVenda: 8 });
	lines = addPoiPrizeLine(lines, { id: "b", valor: 5, valorVenda: 15 });
	assert.deepEqual(lines, [
		{ prizeId: "a", prizeValue: 50, prizeSaleValue: 8, quantity: 2 },
		{ prizeId: "b", prizeValue: 5, prizeSaleValue: 15, quantity: 1 },
	]);
	assert.equal(sumPoiPrizeValue(lines), 105);
	assert.equal(sumPoiPrizeSaleValue(lines), 31);
	assert.deepEqual(setPoiPrizeLineQuantity(lines, "a", 0), [{ prizeId: "b", prizeValue: 5, prizeSaleValue: 15, quantity: 1 }]);
	assert.equal(setPoiPrizeLineQuantity(lines, "b", 3)[1]?.quantity, 3);
});

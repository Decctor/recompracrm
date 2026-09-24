import assert from "node:assert/strict";
import test from "node:test";
import { buildPoiTransactionRequestSummary, readPoiSummaryPrizes } from "./transaction-requests";

const baseInput = {
	orgId: "org",
	client: { id: "cli", nome: "Ana", cpfCnpj: null, telefone: "11999999999" },
	sale: { valor: 0, entregaModalidade: "PRESENCIAL" as const, cashback: { aplicar: false, valor: 0 }, partnerCode: null, coupon: null },
};

test("resumo com duas recompensas: totais somados e uma entrada por recompensa", () => {
	const summary = buildPoiTransactionRequestSummary(
		{
			...baseInput,
			sale: {
				...baseInput.sale,
				prizeRedemptions: [
					{ prizeId: "a", prizeValue: 50, prizeSaleValue: 8, quantity: 2 },
					{ prizeId: "b", prizeValue: 5, prizeSaleValue: 15, quantity: 1 },
				],
			},
		} as never,
		{ a: { titulo: "Café", imagemCapaUrl: null }, b: { titulo: "Bolo", imagemCapaUrl: "img" } },
	);
	assert.equal(summary.venda.modo, "RECOMPENSA");
	assert.equal(summary.venda.valorBruto, 31);
	assert.equal(summary.venda.valorResgate, 105);
	assert.equal(summary.venda.valorFinal, 0);
	assert.equal(summary.recompensas.length, 2);
	assert.equal(summary.recompensas[0]?.prizeTitulo, "Café");
	assert.equal(summary.recompensas[0]?.quantity, 2);
	assert.equal(summary.recompensas[1]?.prizeImageUrl, "img");
	assert.equal(summary.recompensa, null);
});

test("resumo sem recompensa continua no modo DESCONTO", () => {
	const summary = buildPoiTransactionRequestSummary({ ...baseInput, sale: { ...baseInput.sale, valor: 100, cashback: { aplicar: true, valor: 30 } } } as never);
	assert.equal(summary.venda.modo, "DESCONTO");
	assert.equal(summary.venda.valorBruto, 100);
	assert.equal(summary.venda.valorResgate, 30);
	assert.equal(summary.venda.valorFinal, 70);
	assert.deepEqual(summary.recompensas, []);
});

test("leitura de resumo persistido aceita o formato legado", () => {
	assert.deepEqual(readPoiSummaryPrizes({ recompensas: [], recompensa: { prizeId: "a", prizeValue: 50, prizeSaleValue: 8, prizeTitulo: "Café" } }), [
		{ prizeId: "a", prizeValue: 50, prizeSaleValue: 8, prizeTitulo: "Café", quantity: 1 },
	]);
	assert.deepEqual(readPoiSummaryPrizes(null), []);
	assert.equal(readPoiSummaryPrizes({ recompensas: [{ prizeId: "b", prizeValue: 1, prizeSaleValue: 1, quantity: 3 }] })[0]?.quantity, 3);
});

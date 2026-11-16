import assert from "node:assert/strict";
import test from "node:test";
import {
	describeConvertedLine,
	formatConversionFactor,
	getMeasureConversionFactor,
	parseConversionFactor,
	suggestConversionFactor,
} from "./units";

test("measure conversions are known in both directions within a dimension", () => {
	assert.equal(getMeasureConversionFactor("KG", "G"), 1000);
	assert.equal(getMeasureConversionFactor("G", "KG"), 0.001);
	assert.equal(getMeasureConversionFactor("LT", "ML"), 1000);
	assert.equal(getMeasureConversionFactor("M", "CM"), 100);
	assert.equal(getMeasureConversionFactor("DZ", "UN"), 12);
});

test("no measure conversion across dimensions, for the same unit or for packs", () => {
	assert.equal(getMeasureConversionFactor("KG", "L"), null);
	assert.equal(getMeasureConversionFactor("KG", "KGS"), null);
	assert.equal(getMeasureConversionFactor("CX", "UN"), null);
	assert.equal(getMeasureConversionFactor(null, "G"), null);
});

test("suggestion prefers the measure conversion over the pack read in the description", () => {
	assert.equal(suggestConversionFactor({ descricao: "ACUCAR CX 12", documentUnit: "KG", productUnit: "G" }), 1000);
	assert.equal(suggestConversionFactor({ descricao: "LEITE CX/27", documentUnit: "CX", productUnit: "UN" }), 27);
	assert.equal(suggestConversionFactor({ descricao: "LEITE CX/27", documentUnit: "UN", productUnit: "UN" }), null);
});

test("typed factors read pt-BR thousands and decimals", () => {
	assert.equal(parseConversionFactor("1000"), 1000);
	assert.equal(parseConversionFactor("1.000"), 1000);
	assert.equal(parseConversionFactor("1.000,5"), 1000.5);
	assert.equal(parseConversionFactor("0,001"), 0.001);
	assert.equal(parseConversionFactor("0.5"), 0.5);
	assert.equal(parseConversionFactor("1.5"), 1.5);
	assert.equal(parseConversionFactor(""), null);
	assert.equal(parseConversionFactor("0"), null);
	assert.equal(parseConversionFactor(",,"), null);
});

test("factors round-trip through the input text", () => {
	assert.equal(formatConversionFactor(0.001), "0,001");
	assert.equal(formatConversionFactor(1000), "1000");
	assert.equal(parseConversionFactor(formatConversionFactor(0.001)), 0.001);
	assert.equal(formatConversionFactor(null), "");
});

test("converted line keeps the total and shows sub-cent unit costs", () => {
	assert.equal(describeConvertedLine({ quantidade: 1, valorUnitario: 500, fatorConversao: 1000, unit: "G" }), "1.000 G × R$ 0,50");
	assert.equal(describeConvertedLine({ quantidade: 2, valorUnitario: 1, fatorConversao: 1000, unit: "G" }), "2.000 G × R$ 0,001");
	assert.equal(describeConvertedLine({ quantidade: 3, valorUnitario: 10, fatorConversao: null, unit: "UN" }), "3 UN × R$ 10,00");
});

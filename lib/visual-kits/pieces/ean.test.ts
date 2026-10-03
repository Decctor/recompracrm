import assert from "node:assert/strict";
import test from "node:test";
import { isValidGtin } from "@/lib/products/gtin";
import { eanBars, eanViewHeight, normalizeEanCode } from "./ean";

const EAN13 = "4006381333931";

test("EAN-13 e EAN-8 passam como estão; UPC-A ganha o 0 à esquerda", () => {
	assert.ok(isValidGtin(EAN13));
	assert.equal(normalizeEanCode(EAN13), EAN13);
	assert.equal(normalizeEanCode("96385074"), "96385074");
	assert.equal(normalizeEanCode("036000291452"), "0036000291452");
});

test("GTIN-14 com indicador 0 vira o EAN-13 do mesmo item, com o verificador intacto", () => {
	const gtin14 = `0${EAN13}`;
	assert.ok(isValidGtin(gtin14));
	assert.equal(normalizeEanCode(gtin14), EAN13);
	const bars = eanBars(gtin14);
	assert.ok(bars);
	assert.equal(bars.kind, "EAN13");
	assert.equal(bars.digits, EAN13);
	assert.equal(bars.modules.length, 95);
	assert.deepEqual(bars, eanBars(EAN13));
});

test("GTIN-14 com outro indicador (embalagem de agrupamento) não vira EAN-13", () => {
	assert.equal(normalizeEanCode(`1${EAN13}`), null);
	assert.equal(eanBars(`1${EAN13}`), null);
});

test("altura do desenho: padrão de 37 módulos; barras mais altas só somam a faixa dos dígitos", () => {
	assert.equal(eanViewHeight(), 37);
	assert.equal(eanViewHeight(58), 70);
});

test("códigos fora do padrão não renderizam", () => {
	assert.equal(normalizeEanCode(null), null);
	assert.equal(normalizeEanCode(""), null);
	assert.equal(normalizeEanCode("12345"), null);
	assert.equal(normalizeEanCode("40063813339A1"), null);
});

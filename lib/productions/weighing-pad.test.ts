import assert from "node:assert/strict";
import test from "node:test";
import { allowsFractionalQuantity, formatPadValue, getPadKeys, parsePadBuffer, pressPadKey } from "./weighing-pad";

const type = (keys: string[], allowDecimal: boolean) => keys.reduce((buffer, key) => pressPadKey(buffer, key, { allowDecimal }), "");

test("dígitos valem o que foi digitado, sem centésimos implícitos", () => {
	assert.equal(parsePadBuffer(type(["2", "4"], false)), 24);
	assert.equal(parsePadBuffer(type(["2", "4"], true)), 24);
});

test("balança que digita 1.250 vira 1,25 kg", () => {
	const buffer = type(["1", ".", "2", "5", "0"], true);
	assert.equal(buffer, "1,250");
	assert.equal(parsePadBuffer(buffer), 1.25);
	assert.equal(parsePadBuffer(type(["0", ",", "7", "4", "2"], true)), 0.742);
});

test("unidade de contagem ignora o separador", () => {
	assert.equal(type(["2", ",", "4"], false), "24");
	assert.deepEqual(getPadKeys(false).includes(","), false);
	assert.deepEqual(getPadKeys(true).includes(","), true);
});

test("vírgula inicial vira 0, e só existe uma", () => {
	assert.equal(type([","], true), "0,");
	assert.equal(type(["1", ",", "5", ","], true), "1,5");
	assert.equal(parsePadBuffer("12,"), 12);
});

test("zeros à esquerda caem, mas zero digitado é zero", () => {
	assert.equal(type(["0"], true), "0");
	assert.equal(parsePadBuffer(type(["0"], false)), 0);
	assert.equal(type(["0", "0", "5"], true), "5");
	assert.equal(type(["0", "0"], false), "0");
	assert.equal(type(["1", "00"], false), "100");
});

test("limites de 5 dígitos inteiros e 3 decimais", () => {
	assert.equal(type(["1", "2", "3", "4", "5", "6"], true), "12345");
	assert.equal(type(["1", ",", "2", "3", "4", "5"], true), "1,234");
});

test("apagar e buffer vazio", () => {
	assert.equal(pressPadKey("1,2", "back", { allowDecimal: true }), "1,");
	assert.equal(parsePadBuffer(""), null);
});

test("unidades fracionáveis e de contagem", () => {
	for (const unit of ["KG", "kg", "L", "G", "ML", "", null, "XYZ"]) assert.equal(allowsFractionalQuantity(unit), true, String(unit));
	for (const unit of ["UN", "und", "Unidade", "CX", "PC", "DZ"]) assert.equal(allowsFractionalQuantity(unit), false, unit);
});

test("visor do previsto", () => {
	assert.equal(formatPadValue(1.25, true), "1,25");
	assert.equal(formatPadValue(24, false), "24");
});

import assert from "node:assert/strict";
import test from "node:test";
import { barcodeLookupForms, rankBarcodeCandidates } from "./barcode-lookup";

test("formas do código: GTIN perde formatação e UPC-A/EAN-13 se equivalem", () => {
	assert.deepEqual(barcodeLookupForms("  7891234567895 "), ["7891234567895"]);
	assert.deepEqual(barcodeLookupForms("4006.3813.3393-1"), ["4006.3813.3393-1", "4006381333931"]);
	// UPC-A (12 dígitos) também na forma EAN-13 com zero à esquerda.
	assert.deepEqual(barcodeLookupForms("036000291452"), ["036000291452", "0036000291452"]);
	// EAN-13 com zero à esquerda também como UPC-A.
	assert.deepEqual(barcodeLookupForms("0036000291452"), ["0036000291452", "036000291452"]);
	// Código interno é comparado como digitado.
	assert.deepEqual(barcodeLookupForms("SKU-01"), ["SKU-01"]);
	assert.deepEqual(barcodeLookupForms("   "), []);
});

const productRows = [
	{ id: "p1", codigo: "SKU1", codigoBarras: "7891234567895" },
	{ id: "p2", codigo: "7891234567895", codigoBarras: null },
	{ id: "p3", codigo: "SKU3", codigoBarras: null },
];
const variantRows = [
	{ id: "v1", produtoId: "p3", codigo: "SKU3-G", codigoBarras: "7891234567895" },
	{ id: "v2", produtoId: "p3", codigo: "7891234567895", codigoBarras: null },
];

test("variante com código de barras ganha de produto com código de barras e de SKUs", () => {
	const ranked = rankBarcodeCandidates({ forms: ["7891234567895"], productRows, variantRows });
	assert.deepEqual(ranked, [{ productId: "p3", variantId: "v1", matchedBy: "VARIANTE_CODIGO_BARRAS" }]);
});

test("sem variante, o código de barras do produto ganha do SKU igual", () => {
	const ranked = rankBarcodeCandidates({ forms: ["7891234567895"], productRows, variantRows: [] });
	assert.deepEqual(ranked, [{ productId: "p1", variantId: null, matchedBy: "PRODUTO_CODIGO_BARRAS" }]);
});

test("SKU só resolve quando nenhum código de barras bate; duplicados ficam todos na camada", () => {
	const ranked = rankBarcodeCandidates({
		forms: ["SKU3"],
		productRows: [...productRows, { id: "p4", codigo: "SKU3", codigoBarras: null }],
		variantRows,
	});
	assert.deepEqual(ranked, [
		{ productId: "p3", variantId: null, matchedBy: "PRODUTO_CODIGO" },
		{ productId: "p4", variantId: null, matchedBy: "PRODUTO_CODIGO" },
	]);
});

test("nada bate: lista vazia", () => {
	assert.deepEqual(rankBarcodeCandidates({ forms: ["000"], productRows, variantRows }), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { getProductNatureWarning, resolveDefaultDestination, resolveEntryLineDisposition } from "./entry-rules";

test("sale CFOPs are purchases, 5910/6910 is a bonification, remessas and devoluções stay out", () => {
	assert.deepEqual(resolveEntryLineDisposition({ cfop: "5102" }), { tipo: "COMPRA" });
	assert.deepEqual(resolveEntryLineDisposition({ cfop: "6403" }), { tipo: "COMPRA" });
	assert.deepEqual(resolveEntryLineDisposition({ cfop: "5910" }), { tipo: "BONIFICACAO" });
	assert.deepEqual(resolveEntryLineDisposition({ cfop: "6910" }), { tipo: "BONIFICACAO" });
	assert.equal(resolveEntryLineDisposition({ cfop: "5917" }).tipo, "FORA");
	assert.equal(resolveEntryLineDisposition({ cfop: "6152" }).tipo, "FORA");
	assert.match((resolveEntryLineDisposition({ cfop: "5202" }) as { motivo: string }).motivo, /Devolução de venda/);
});

test("a missing or malformed CFOP is treated as a purchase, never as 'fora'", () => {
	assert.deepEqual(resolveEntryLineDisposition({ cfop: null }), { tipo: "COMPRA" });
	assert.deepEqual(resolveEntryLineDisposition({ cfop: "91" }), { tipo: "COMPRA" });
});

test("the remembered mapping wins over the product nature, which wins over revenda", () => {
	assert.equal(resolveDefaultDestination({ mappingDestination: "USO_CONSUMO", productNature: "INSUMO" }), "USO_CONSUMO");
	assert.equal(resolveDefaultDestination({ mappingDestination: null, productNature: "INSUMO" }), "INSUMO");
	assert.equal(resolveDefaultDestination({}), "REVENDA");
});

test("warns about a sellable fixed asset or consumable, blocks nothing", () => {
	assert.ok(getProductNatureWarning({ natureza: "ATIVO_IMOBILIZADO", vendavel: true }));
	assert.equal(getProductNatureWarning({ natureza: "INSUMO", vendavel: true }), null);
	assert.equal(getProductNatureWarning({ natureza: "REVENDA", vendavel: true }), null);
});

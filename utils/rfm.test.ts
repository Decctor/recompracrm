import assert from "node:assert/strict";
import { test } from "node:test";
import { getRFMLabel, getRFMConfigByLabel, NO_PURCHASES_RFM_LABEL } from "./rfm";
test("customers without confirmed purchases stay outside RFM", () => {
	assert.equal(getRFMLabel({ monetary: 1, frequency: 1, recency: 1, hasConfirmedPurchase: false }), NO_PURCHASES_RFM_LABEL);
});
test("previous buyers outside the window remain eligible for recovery", () => {
	assert.equal(getRFMLabel({ monetary: 1, frequency: 1, recency: 1, hasConfirmedPurchase: true }), "PERDIDOS");
});
test("first purchase enters normal RFM", () => {
	assert.equal(getRFMLabel({ monetary: 1, frequency: 1, recency: 5, hasConfirmedPurchase: true }), "CLIENTES RECENTES");
});
test("unknown labels never borrow lost customer styling", () => {
	assert.equal(getRFMConfigByLabel(null).text, "NÃO DEFINIDO");
	assert.equal(getRFMConfigByLabel("unknown").text, "NÃO DEFINIDO");
	assert.equal(getRFMConfigByLabel(NO_PURCHASES_RFM_LABEL).backgroundCollor, "bg-slate-500");
});

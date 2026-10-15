import assert from "node:assert/strict";
import test from "node:test";
import {
	compareServiceCardCodes,
	extractServiceCardToken,
	generateServiceCardCodes,
	getServiceCardUrl,
	normalizeServiceCardCode,
} from "./service-card-codes";

test("normalizeServiceCardCode: numeric codes ignore leading zeros", () => {
	assert.equal(normalizeServiceCardCode("007"), "7");
	assert.equal(normalizeServiceCardCode("07"), "7");
	assert.equal(normalizeServiceCardCode(" 7 "), "7");
	assert.equal(normalizeServiceCardCode("000"), "0");
	assert.equal(normalizeServiceCardCode("100"), "100");
});

test("normalizeServiceCardCode: alphanumeric codes keep their digits", () => {
	assert.equal(normalizeServiceCardCode("a07"), "A07");
	assert.notEqual(normalizeServiceCardCode("A07"), normalizeServiceCardCode("A7"));
	assert.equal(normalizeServiceCardCode(" vip "), "VIP");
});

test("generateServiceCardCodes pads and prefixes", () => {
	assert.deepEqual(generateServiceCardCodes({ inicio: 1, fim: 3, digitos: 3 }), ["001", "002", "003"]);
	assert.deepEqual(generateServiceCardCodes({ inicio: 9, fim: 10, digitos: 0, prefixo: " a" }), ["A9", "A10"]);
	assert.deepEqual(generateServiceCardCodes({ inicio: 99, fim: 100, digitos: 2 }), ["99", "100"]);
});

test("generateServiceCardCodes rejects invalid ranges", () => {
	assert.deepEqual(generateServiceCardCodes({ inicio: 5, fim: 1, digitos: 0 }), []);
	assert.deepEqual(generateServiceCardCodes({ inicio: -1, fim: 1, digitos: 0 }), []);
	assert.deepEqual(generateServiceCardCodes({ inicio: 1.5, fim: 3, digitos: 0 }), []);
});

test("extractServiceCardToken survives keyboard-layout mangling", () => {
	const token = "a".repeat(32) + "0123456789abcdef".repeat(2);
	assert.equal(extractServiceCardToken(`https://app.recompracrm.com.br/service-card/${token}`), token);
	// Leitor em layout US num SO ABNT2: ":" vira "Ç" e "/" vira ";".
	assert.equal(extractServiceCardToken(`httpsÇ;;app.recompracrm.com.br;service-card;${token.toUpperCase()}`), token);
	assert.equal(extractServiceCardToken("007"), null);
});

test("getServiceCardUrl strips trailing slash", () => {
	assert.equal(getServiceCardUrl("abc", "https://x.com/"), "https://x.com/service-card/abc");
});

test("compareServiceCardCodes orders numerically", () => {
	assert.deepEqual(["10", "2", "001"].sort(compareServiceCardCodes), ["001", "2", "10"]);
	assert.deepEqual(["A10", "A2"].sort(compareServiceCardCodes), ["A2", "A10"]);
});

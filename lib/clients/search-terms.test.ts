import assert from "node:assert/strict";
import test from "node:test";
import { clientSearchUsesFuzzy, parseClientSearchTerm } from "./search-terms";

test("termo curto demais não busca", () => {
	assert.equal(parseClientSearchTerm(""), null);
	assert.equal(parseClientSearchTerm("  a "), null);
	assert.equal(parseClientSearchTerm(null), null);
});

test("nome vira palavras independentes de ordem, sem ramo de telefone nem documento", () => {
	const term = parseClientSearchTerm("  Gustavo   Castro ");
	assert.ok(term);
	assert.equal(term.text, "Gustavo Castro");
	assert.deepEqual(
		term.nameTokens.map((token) => token.value),
		["Gustavo", "Castro"],
	);
	assert.equal(term.digits, "");
	assert.deepEqual(term.phonePatterns, []);
	// Com espaço, não há e-mail que case.
	assert.equal(term.matchesEmail, false);
});

test("aproximação só para palavras com 3 letras ou mais", () => {
	const term = parseClientSearchTerm("Jo Silva");
	assert.ok(term);
	assert.deepEqual(
		term.nameTokens.map((token) => [token.value, token.fuzzy]),
		[
			["Jo", false],
			["Silva", true],
		],
	);
	assert.equal(clientSearchUsesFuzzy(term), true);
	assert.equal(clientSearchUsesFuzzy(parseClientSearchTerm("Jo")!), false);
});

test("busca numérica usa telefone e documento, e promove o final de telefone", () => {
	const term = parseClientSearchTerm("(34) 99199-4443");
	assert.ok(term);
	assert.equal(term.digits, "34991994443");
	assert.deepEqual(term.nameTokens, []);
	assert.ok(term.phonePatterns.includes("34991994443"));
	assert.ok(term.phonePatterns.includes("3491994443"));
	assert.equal(term.phoneFinalFour, "4443");
});

test("CPF válido não é tratado como telefone para a relevância", () => {
	const term = parseClientSearchTerm("078.463.146-88");
	assert.ok(term);
	assert.equal(term.digits, "07846314688");
	assert.equal(term.phoneFinalFour, null);
});

test("poucos dígitos não abrem telefone nem documento", () => {
	const term = parseClientSearchTerm("123");
	assert.ok(term);
	assert.equal(term.digits, "");
	assert.deepEqual(term.phonePatterns, []);
});

test("números soltos numa busca mista restringem por contato", () => {
	const term = parseClientSearchTerm("Gustavo 9944");
	assert.ok(term);
	assert.deepEqual(
		term.nameTokens.map((token) => token.value),
		["Gustavo"],
	);
	assert.deepEqual(term.digitTokens, ["9944"]);
	assert.equal(term.digits, "");
});

test("e-mail parcial mantém o ramo de e-mail", () => {
	const term = parseClientSearchTerm("gustavo@gmail");
	assert.ok(term);
	assert.equal(term.matchesEmail, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { isClientSearchIntentComplete, parseClientSearchIntent } from "./parse-client-search-intent";

test("telefone parcial não é identificador completo; com 10 ou 11 dígitos é", () => {
	assert.equal(parseClientSearchIntent("349966268").kind, "phone");
	assert.equal(isClientSearchIntentComplete("349966268"), false);
	assert.equal(isClientSearchIntentComplete("3499"), false);
	assert.equal(isClientSearchIntentComplete("(34) 99662-6855"), true);
	assert.equal(isClientSearchIntentComplete("3496626855"), true);
});

test("nome e CPF/CNPJ válidos são sempre completos", () => {
	assert.equal(isClientSearchIntentComplete("Lucas"), true);
	assert.equal(isClientSearchIntentComplete("lu"), true);
	// CPF válido (dígitos verificadores corretos)
	assert.equal(parseClientSearchIntent("529.982.247-25").kind, "cpf_cnpj");
	assert.equal(isClientSearchIntentComplete("529.982.247-25"), true);
});

test("11 dígitos que não formam CPF válido são telefone completo", () => {
	assert.equal(parseClientSearchIntent("34996626855").kind, "phone");
	assert.equal(isClientSearchIntentComplete("34996626855"), true);
});

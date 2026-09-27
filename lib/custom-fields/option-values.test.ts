import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomFieldOptionValue, buildUniqueCustomFieldOptionValues } from "./option-values";

test("option value is SCREAMING_SNAKE without accents", () => {
	assert.equal(buildCustomFieldOptionValue("Limão siciliano"), "LIMAO_SICILIANO");
	assert.equal(buildCustomFieldOptionValue("  Açaí com granola!  "), "ACAI_COM_GRANOLA");
	assert.equal(buildCustomFieldOptionValue("🍓"), "OPCAO");
	assert.equal(buildCustomFieldOptionValue("x".repeat(100)).length, 64);
});

test("duplicate titles get numbered values", () => {
	assert.deepEqual(buildUniqueCustomFieldOptionValues(["Morango", "morango", "Limão"]), ["MORANGO", "MORANGO_2", "LIMAO"]);
});

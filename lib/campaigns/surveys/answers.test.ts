import assert from "node:assert/strict";
import test from "node:test";
import { findSurveyButtonByText, mergeSurveyAnswerIntoFieldValue, resolveSurveyAnswer, resolveSurveyOptionTitle } from "./answers";

const BUTTONS = [
	{ tipo: "RESPOSTA_PESQUISA" as const, texto: "Morango", campoId: "campo", opcaoValor: "MORANGO" },
	{ tipo: "RESPOSTA_PESQUISA" as const, texto: "Limão siciliano", campoId: "campo", opcaoValor: "LIMAO" },
];

test("button text match ignores case and surrounding whitespace", () => {
	assert.equal(findSurveyButtonByText(BUTTONS, "  morango ")?.opcaoValor, "MORANGO");
	assert.equal(findSurveyButtonByText(BUTTONS, "LIMÃO SICILIANO")?.opcaoValor, "LIMAO");
	assert.equal(findSurveyButtonByText(BUTTONS, "Pistache"), null);
	assert.equal(findSurveyButtonByText(BUTTONS, "   "), null);
});

test("option title snapshot falls back to the button label", () => {
	assert.equal(resolveSurveyOptionTitle({ options: [{ valor: "MORANGO", titulo: "Morango 🍓" }], button: BUTTONS[0] }), "Morango 🍓");
	assert.equal(resolveSurveyOptionTitle({ options: [], button: BUTTONS[1] }), "Limão siciliano");
	assert.equal(resolveSurveyOptionTitle({ options: null, button: BUTTONS[1] }), "Limão siciliano");
});

const reply = (opcaoValor: string) => ({ opcaoValor, opcaoTitulo: opcaoValor, origem: "PAYLOAD" as const, data: "2026-09-27T10:00:00.000Z" });

test("single choice keeps the last tap, multiple choice keeps the set", () => {
	const replies = [reply("MORANGO"), reply("LIMAO"), reply("MORANGO")];
	assert.deepEqual(resolveSurveyAnswer({ fieldType: "ESCOLHA_UNICA", replies }), ["MORANGO"]);
	assert.deepEqual(resolveSurveyAnswer({ fieldType: "ESCOLHA_MULTIPLA", replies }), ["MORANGO", "LIMAO"]);
	assert.deepEqual(resolveSurveyAnswer({ fieldType: "ESCOLHA_UNICA", replies: [] }), []);
	assert.deepEqual(resolveSurveyAnswer({ fieldType: "ESCOLHA_MULTIPLA", replies: null }), []);
});

test("field merge replaces for single choice and accumulates for multiple choice", () => {
	assert.equal(mergeSurveyAnswerIntoFieldValue({ fieldType: "ESCOLHA_UNICA", currentValue: "LIMAO", opcaoValor: "MORANGO" }), "MORANGO");
	assert.deepEqual(mergeSurveyAnswerIntoFieldValue({ fieldType: "ESCOLHA_MULTIPLA", currentValue: ["LIMAO"], opcaoValor: "MORANGO" }), ["LIMAO", "MORANGO"]);
	assert.deepEqual(mergeSurveyAnswerIntoFieldValue({ fieldType: "ESCOLHA_MULTIPLA", currentValue: ["MORANGO"], opcaoValor: "MORANGO" }), ["MORANGO"]);
	assert.deepEqual(mergeSurveyAnswerIntoFieldValue({ fieldType: "ESCOLHA_MULTIPLA", currentValue: null, opcaoValor: "MORANGO" }), ["MORANGO"]);
	// Um campo que era ESCOLHA_UNICA e virou múltipla pode ter uma string gravada.
	assert.deepEqual(mergeSurveyAnswerIntoFieldValue({ fieldType: "ESCOLHA_MULTIPLA", currentValue: "LIMAO", opcaoValor: "MORANGO" }), ["LIMAO", "MORANGO"]);
});

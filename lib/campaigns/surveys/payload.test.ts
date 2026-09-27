import assert from "node:assert/strict";
import test from "node:test";
import { buildSurveyGatewayButtons, buildSurveyReplyPayload, parseSurveyReplyPayload, SURVEY_REPLY_PAYLOAD_MAX_LENGTH } from "./payload";

const INTERACTION_ID = "0f3c2a1e-6b7d-4c8e-9f01-23456789abcd";

test("payload round-trips interaction id and option value", () => {
	const payload = buildSurveyReplyPayload({ interactionId: INTERACTION_ID, opcaoValor: "MORANGO" });
	assert.equal(payload, `psq:${INTERACTION_ID}:MORANGO`);
	assert.deepEqual(parseSurveyReplyPayload(payload), { interactionId: INTERACTION_ID, opcaoValor: "MORANGO" });
});

test("option values may contain the separator", () => {
	const payload = buildSurveyReplyPayload({ interactionId: INTERACTION_ID, opcaoValor: "A:B" });
	assert.deepEqual(parseSurveyReplyPayload(payload), { interactionId: INTERACTION_ID, opcaoValor: "A:B" });
});

test("a 64-char option value stays under the Meta payload limit", () => {
	const payload = buildSurveyReplyPayload({ interactionId: INTERACTION_ID, opcaoValor: "x".repeat(64) });
	assert.ok(payload.length <= SURVEY_REPLY_PAYLOAD_MAX_LENGTH);
});

test("foreign payloads are ignored", () => {
	assert.equal(parseSurveyReplyPayload(null), null);
	assert.equal(parseSurveyReplyPayload(""), null);
	assert.equal(parseSurveyReplyPayload("Morango"), null);
	assert.equal(parseSurveyReplyPayload("psq:"), null);
	assert.equal(parseSurveyReplyPayload("psq::MORANGO"), null);
	assert.equal(parseSurveyReplyPayload(`psq:${INTERACTION_ID}:`), null);
	assert.equal(parseSurveyReplyPayload(`psq:${INTERACTION_ID}`), null);
});

test("gateway buttons carry the payload as id and skip non-survey buttons", () => {
	const buttons = buildSurveyGatewayButtons({
		interactionId: INTERACTION_ID,
		content: {
			botoes: [
				{ tipo: "URL", texto: "Ver", url: "https://x" },
				{ tipo: "RESPOSTA_PESQUISA", texto: "Morango", campoId: "campo", opcaoValor: "MORANGO" },
				{ tipo: "RESPOSTA_PESQUISA", texto: "Limão", campoId: "campo", opcaoValor: "LIMAO" },
			],
		},
	});
	assert.deepEqual(buttons, [
		{ type: "quick_reply", text: "Morango", id: `psq:${INTERACTION_ID}:MORANGO` },
		{ type: "quick_reply", text: "Limão", id: `psq:${INTERACTION_ID}:LIMAO` },
	]);
});

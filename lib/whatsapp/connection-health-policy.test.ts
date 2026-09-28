import assert from "node:assert/strict";
import test from "node:test";
import { classifyWhatsappPhoneHealth, parseWhatsappAccountHealthWebhook, resolveNextWhatsappPhoneHealth } from "./connection-health-policy";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

test("CONNECTED é saudável; qualquer outro status do telefone é falha", () => {
	assert.deepEqual(classifyWhatsappPhoneHealth({ phone: { status: "CONNECTED" } }), { status: "SAUDAVEL" });
	const flagged = classifyWhatsappPhoneHealth({ phone: { status: "FLAGGED" } });
	assert.equal(flagged.status, "FALHA");
	assert.equal(flagged.status === "FALHA" && flagged.motivo, "TELEFONE_INDISPONIVEL");
});

test("erros definitivos da Graph viram falha com motivo", () => {
	const motivo = (error: Parameters<typeof classifyWhatsappPhoneHealth>[0]["error"]) => {
		const result = classifyWhatsappPhoneHealth({ error });
		return result.status === "FALHA" ? result.motivo : result.status;
	};
	assert.equal(motivo({ code: 190 }), "TOKEN_INVALIDO");
	assert.equal(motivo({ code: 100, error_subcode: 33 }), "SEM_ACESSO");
	assert.equal(motivo({ code: 10 }), "SEM_PERMISSAO");
	assert.equal(motivo({ code: 200 }), "SEM_PERMISSAO");
});

test("erros transitórios ou desconhecidos não afirmam nada", () => {
	assert.equal(classifyWhatsappPhoneHealth({ error: { code: 4 } }).status, "INDETERMINADO");
	assert.equal(classifyWhatsappPhoneHealth({ error: { code: 190, is_transient: true } }).status, "INDETERMINADO");
	assert.equal(classifyWhatsappPhoneHealth({ error: { code: 100 } }).status, "INDETERMINADO");
	assert.equal(resolveNextWhatsappPhoneHealth({ current: null, check: { status: "INDETERMINADO", mensagem: "x" }, now: NOW }), null);
});

test("transição para falha avisa; falha contínua só relembra depois de 7 dias", () => {
	const check = { status: "FALHA" as const, motivo: "SEM_ACESSO", mensagem: "sem acesso" };

	const first = resolveNextWhatsappPhoneHealth({ current: { status: "SAUDAVEL", verificadoEm: "2026-09-27T00:00:00.000Z" }, check, now: NOW });
	assert.equal(first?.notify, true);
	assert.equal(first?.saude.falhandoDesde, NOW.toISOString());
	assert.equal(first?.saude.notificadoEm, NOW.toISOString());

	const later = new Date(NOW.getTime() + 6 * DAY);
	const repeated = resolveNextWhatsappPhoneHealth({ current: first?.saude, check, now: later });
	assert.equal(repeated?.notify, false);
	assert.equal(repeated?.saude.falhandoDesde, NOW.toISOString());
	assert.equal(repeated?.saude.notificadoEm, NOW.toISOString());

	const reminder = resolveNextWhatsappPhoneHealth({ current: repeated?.saude, check, now: new Date(NOW.getTime() + 7 * DAY) });
	assert.equal(reminder?.notify, true);
	assert.equal(reminder?.saude.falhandoDesde, NOW.toISOString());
});

test("recuperação limpa a sequência de falha, e uma nova falha avisa de novo", () => {
	const check = { status: "FALHA" as const, motivo: "SEM_ACESSO", mensagem: "sem acesso" };
	const failing = resolveNextWhatsappPhoneHealth({ current: null, check, now: NOW });
	const healthy = resolveNextWhatsappPhoneHealth({ current: failing?.saude, check: { status: "SAUDAVEL" }, now: new Date(NOW.getTime() + DAY) });
	assert.deepEqual(
		{ status: healthy?.saude.status, falhandoDesde: healthy?.saude.falhandoDesde, notificadoEm: healthy?.saude.notificadoEm, notify: healthy?.notify },
		{ status: "SAUDAVEL", falhandoDesde: null, notificadoEm: null, notify: false },
	);
	const again = resolveNextWhatsappPhoneHealth({ current: healthy?.saude, check, now: new Date(NOW.getTime() + 2 * DAY) });
	assert.equal(again?.notify, true);
});

test("eventos de conta/número: um por change, WABA vem do entry.id", () => {
	const events = parseWhatsappAccountHealthWebhook({
		object: "whatsapp_business_account",
		entry: [
			{ id: "111", changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED" } }] },
			{ id: "222", changes: [{ field: "messages", value: {} }] },
			{ id: "333", changes: [{ field: "phone_number_quality_update", value: { event: "FLAGGED", display_phone_number: "5534999999999" } }] },
		],
	});
	assert.deepEqual(events, [
		{ whatsappBusinessAccountId: "111", campo: "account_update", evento: "PARTNER_REMOVED" },
		{ whatsappBusinessAccountId: "333", campo: "phone_number_quality_update", evento: "FLAGGED" },
	]);
	assert.deepEqual(parseWhatsappAccountHealthWebhook({ entry: "invalid" }), []);
	assert.deepEqual(parseWhatsappAccountHealthWebhook({ entry: [{ id: "1", changes: [{ field: "toString" }] }] }), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
	UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS,
	type TUnansweredCoverageAttendance,
	decideUnansweredAttendanceCoverage,
	isAttendanceInactive,
	resolveAttendanceLastActivity,
} from "./attendance-policy";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const now = new Date("2026-11-06T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("última atividade é a mais recente entre atribuição, entrada e resposta", () => {
	const last = resolveAttendanceLastActivity({
		dataAtribuicao: ago(20 * HOUR),
		dataUltimaEntradaCliente: ago(18 * HOUR),
		dataUltimaResposta: ago(15 * HOUR),
	});
	assert.equal(last.getTime(), ago(15 * HOUR).getTime());
	assert.equal(
		resolveAttendanceLastActivity({ dataAtribuicao: ago(3 * HOUR), dataUltimaEntradaCliente: null, dataUltimaResposta: null }).getTime(),
		ago(3 * HOUR).getTime(),
	);
});

test("cliente volta na manhã seguinte: atendimento novo com 12h", () => {
	// Última mensagem da loja às 18h de ontem; o cliente volta às 9h (15h depois).
	const attendance = { dataAtribuicao: ago(20 * HOUR), dataUltimaEntradaCliente: ago(16 * HOUR), dataUltimaResposta: ago(15 * HOUR) };
	assert.equal(isAttendanceInactive({ attendance, messageDate: now, inatividadeHoras: 12 }), true);
	assert.equal(isAttendanceInactive({ attendance, messageDate: now, inatividadeHoras: 24 }), false);
});

test("inatividade desligada nunca abre atendimento novo", () => {
	const attendance = { dataAtribuicao: ago(100 * HOUR), dataUltimaEntradaCliente: null, dataUltimaResposta: null };
	assert.equal(isAttendanceInactive({ attendance, messageDate: now, inatividadeHoras: null }), false);
});

test("conversa em curso não é inativa", () => {
	const attendance = { dataAtribuicao: ago(20 * HOUR), dataUltimaEntradaCliente: ago(2 * MINUTE), dataUltimaResposta: ago(1 * MINUTE) };
	assert.equal(isAttendanceInactive({ attendance, messageDate: now, inatividadeHoras: 1 }), false);
});

const pendingHumanAttendance: TUnansweredCoverageAttendance = {
	responsavelTipo: "USUARIO",
	transferenciaMotivo: null,
	dataAtribuicao: ago(2 * HOUR),
	dataUltimaEntradaCliente: ago(20 * MINUTE),
	dataUltimaResposta: ago(30 * MINUTE),
};

test("responsável sem responder além da espera: o agente cobre", () => {
	const decision = decideUnansweredAttendanceCoverage({
		attendance: pendingHumanAttendance,
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(decision, { cover: true });
});

test("dentro da espera, o responsável ainda tem a vez", () => {
	const decision = decideUnansweredAttendanceCoverage({
		attendance: pendingHumanAttendance,
		esperaResponsavelMs: 30 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(decision, { cover: false, reason: "WITHIN_WAIT" });
});

test("a espera recomeça quando a conversa troca de responsável", () => {
	const decision = decideUnansweredAttendanceCoverage({
		attendance: { ...pendingHumanAttendance, dataAtribuicao: ago(5 * MINUTE) },
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(decision, { cover: false, reason: "WITHIN_WAIT" });
});

test("atendimento pelo celular também é coberto", () => {
	const decision = decideUnansweredAttendanceCoverage({
		attendance: { ...pendingHumanAttendance, responsavelTipo: "EXTERNO" },
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(decision, { cover: true });
});

test("já respondido ou sem dono humano não é coberto", () => {
	const answered = decideUnansweredAttendanceCoverage({
		attendance: { ...pendingHumanAttendance, dataUltimaResposta: ago(1 * MINUTE) },
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(answered, { cover: false, reason: "NOT_PENDING" });

	const agentOwned = decideUnansweredAttendanceCoverage({
		attendance: { ...pendingHumanAttendance, responsavelTipo: "AGENTE" },
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(agentOwned, { cover: false, reason: "NOT_HUMAN_OWNED" });
});

test("mensagem pendente antiga demais não é respondida de repente", () => {
	const decision = decideUnansweredAttendanceCoverage({
		attendance: {
			...pendingHumanAttendance,
			dataAtribuicao: ago(20 * HOUR),
			dataUltimaResposta: null,
			dataUltimaEntradaCliente: new Date(now.getTime() - UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS - MINUTE),
		},
		esperaResponsavelMs: 15 * MINUTE,
		humanRepliedSinceAssignment: true,
		now,
	});
	assert.deepEqual(decision, { cover: false, reason: "TOO_OLD" });
});

test("handoff da IA que ninguém da equipe pegou não volta para ela", () => {
	const attendance = { ...pendingHumanAttendance, transferenciaMotivo: "HUMAN_HANDOFF: cliente pediu atendente" };
	const notPickedUp = decideUnansweredAttendanceCoverage({ attendance, esperaResponsavelMs: 15 * MINUTE, humanRepliedSinceAssignment: false, now });
	assert.deepEqual(notPickedUp, { cover: false, reason: "AI_HANDOFF_NOT_PICKED_UP" });

	// Depois que alguém da equipe respondeu, a ausência posterior é coberta como qualquer outra.
	const pickedUp = decideUnansweredAttendanceCoverage({ attendance, esperaResponsavelMs: 15 * MINUTE, humanRepliedSinceAssignment: true, now });
	assert.deepEqual(pickedUp, { cover: true });
});

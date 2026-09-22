import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAutoEmissionSchedule } from "./auto-emission-delay";
import { AUTO_EMISSION_MAX_DELAY_MINUTES } from "./constants";

const now = new Date("2026-09-22T12:00:00.000Z");

test("atraso zero emite imediatamente", () => {
	assert.deepEqual(resolveAutoEmissionSchedule({ atrasoMinutos: 0, agendadaPara: null, now }), { acao: "EMITIR" });
});

test("atraso ausente ou negativo emite imediatamente", () => {
	assert.deepEqual(resolveAutoEmissionSchedule({ atrasoMinutos: undefined, agendadaPara: null, now }), { acao: "EMITIR" });
	assert.deepEqual(resolveAutoEmissionSchedule({ atrasoMinutos: -10, agendadaPara: null, now }), { acao: "EMITIR" });
});

test("atraso positivo sem agendamento agenda para now + atraso", () => {
	const decision = resolveAutoEmissionSchedule({ atrasoMinutos: 30, agendadaPara: null, now });
	assert.deepEqual(decision, { acao: "AGENDAR", agendadaPara: new Date("2026-09-22T12:30:00.000Z") });
});

test("agendamento vigente não agenda de novo e devolve o horário existente", () => {
	const agendadaPara = new Date("2026-09-22T12:10:00.000Z");
	const decision = resolveAutoEmissionSchedule({ atrasoMinutos: 30, agendadaPara, now });
	assert.deepEqual(decision, { acao: "JA_AGENDADA", agendadaPara });
});

test("agendamento vencido continua vigente até quem executa limpar", () => {
	const agendadaPara = new Date("2026-09-22T11:00:00.000Z");
	const decision = resolveAutoEmissionSchedule({ atrasoMinutos: 30, agendadaPara, now });
	assert.deepEqual(decision, { acao: "JA_AGENDADA", agendadaPara });
});

test("agendamento vigente com atraso zerado depois emite imediatamente", () => {
	// A org desligou o atraso enquanto uma venda esperava: o gatilho seguinte emite, e o consumer
	// da mensagem antiga recua ao encontrar documento vivo.
	const agendadaPara = new Date("2026-09-22T12:10:00.000Z");
	assert.deepEqual(resolveAutoEmissionSchedule({ atrasoMinutos: 0, agendadaPara, now }), { acao: "EMITIR" });
});

test("atraso acima do teto é capado no limite da fila", () => {
	const decision = resolveAutoEmissionSchedule({ atrasoMinutos: AUTO_EMISSION_MAX_DELAY_MINUTES * 3, agendadaPara: null, now });
	assert.deepEqual(decision, {
		acao: "AGENDAR",
		agendadaPara: new Date(now.getTime() + AUTO_EMISSION_MAX_DELAY_MINUTES * 60_000),
	});
});

test("minutos fracionários são truncados", () => {
	const decision = resolveAutoEmissionSchedule({ atrasoMinutos: 15.9, agendadaPara: null, now });
	assert.deepEqual(decision, { acao: "AGENDAR", agendadaPara: new Date("2026-09-22T12:15:00.000Z") });
});

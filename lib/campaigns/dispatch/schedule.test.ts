import assert from "node:assert/strict";
import test from "node:test";
import {
	buildScheduledWindowReference,
	isDispatchDue,
	resolveDateForWindow,
	resolveEventDispatchScheduledAt,
	resolveScheduledWindowsForNow,
	shouldRecurrentCampaignRunOnDate,
} from "./schedule";

// Os testes assumem o fuso padrão do cron (America/Sao_Paulo, UTC-3 sem horário de verão).
const saoPauloNoon = new Date("2026-09-17T15:00:00.000Z"); // 12:00 em São Paulo (quinta-feira)

test("janela agendada: chave única por dia e bloco", () => {
	assert.equal(buildScheduledWindowReference({ dateKey: "2026-09-17", block: "14:00" }), "2026-09-17@14:00");
});

test("janela agendada: blocos vencidos do dia entram na resolução (recuperação de hora perdida)", () => {
	const windows = resolveScheduledWindowsForNow(saoPauloNoon);
	assert.equal(windows.dateKey, "2026-09-17");
	assert.equal(windows.currentBlock, "12:00");
	assert.deepEqual(windows.arrivedBlocks.slice(-2), ["11:00", "12:00"]);
	assert.equal(windows.arrivedBlocks.includes("13:00"), false);
});

test("janela agendada: instante do bloco no fuso do cron", () => {
	assert.equal(resolveDateForWindow({ dateKey: "2026-09-17", block: "14:00" }).toISOString(), "2026-09-17T17:00:00.000Z");
});

test("recorrência diária a cada 2 dias desde a criação", () => {
	const campaign = {
		recorrenciaTipo: "DIARIO",
		recorrenciaIntervalo: 2,
		recorrenciaDiasSemana: null,
		recorrenciaDiasMes: null,
		dataInsercao: new Date("2026-09-15T12:00:00.000Z"),
	};
	assert.equal(shouldRecurrentCampaignRunOnDate(campaign, saoPauloNoon), true);
	assert.equal(shouldRecurrentCampaignRunOnDate(campaign, new Date("2026-09-18T15:00:00.000Z")), false);
});

test("recorrência semanal respeita a lista de dias e o intervalo de semanas", () => {
	const campaign = {
		recorrenciaTipo: "SEMANAL",
		recorrenciaIntervalo: 1,
		recorrenciaDiasSemana: JSON.stringify([4]), // quinta
		recorrenciaDiasMes: null,
		dataInsercao: new Date("2026-09-01T12:00:00.000Z"),
	};
	assert.equal(shouldRecurrentCampaignRunOnDate(campaign, saoPauloNoon), true);
	assert.equal(shouldRecurrentCampaignRunOnDate({ ...campaign, recorrenciaDiasSemana: JSON.stringify([1]) }, saoPauloNoon), false);
	assert.equal(shouldRecurrentCampaignRunOnDate({ ...campaign, recorrenciaDiasSemana: "não é json" }, saoPauloNoon), false);
});

test("recorrência mensal: dia do mês e campanha criada depois de hoje nunca roda", () => {
	const campaign = {
		recorrenciaTipo: "MENSAL",
		recorrenciaIntervalo: 1,
		recorrenciaDiasSemana: null,
		recorrenciaDiasMes: JSON.stringify([17]),
		dataInsercao: new Date("2026-08-01T12:00:00.000Z"),
	};
	assert.equal(shouldRecurrentCampaignRunOnDate(campaign, saoPauloNoon), true);
	assert.equal(shouldRecurrentCampaignRunOnDate({ ...campaign, dataInsercao: new Date("2026-10-01T12:00:00.000Z") }, saoPauloNoon), false);
});

test("disparo de evento: sem atraso é imediato; com atraso cai no bloco da campanha", () => {
	assert.equal(
		resolveEventDispatchScheduledAt({
			campaign: { execucaoAgendadaMedida: "DIAS", execucaoAgendadaValor: 0, execucaoAgendadaBloco: "09:00" },
			now: saoPauloNoon,
		}),
		null,
	);
	const scheduledAt = resolveEventDispatchScheduledAt({
		campaign: { execucaoAgendadaMedida: "DIAS", execucaoAgendadaValor: 2, execucaoAgendadaBloco: "09:00" },
		now: saoPauloNoon,
	});
	assert.equal(scheduledAt?.toISOString(), "2026-09-19T12:00:00.000Z");
	assert.equal(isDispatchDue({ scheduledAt, now: saoPauloNoon }), false);
	assert.equal(isDispatchDue({ scheduledAt, now: new Date("2026-09-19T12:00:00.000Z") }), true);
	assert.equal(isDispatchDue({ scheduledAt: null, now: saoPauloNoon }), true);
});

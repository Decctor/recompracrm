import assert from "node:assert/strict";
import test from "node:test";
import { computeSendQuotaGrant, getSendQuotaWindowKeys, listSendQuotaCounters, type TSendQuotaCounterState } from "./send-counters";

function counters(
	overrides: Partial<Record<"orgDaily" | "orgWeekly" | "campDaily" | "campWeekly", { limit: number | null; used: number }>>,
): TSendQuotaCounterState[] {
	const base = { limit: null, used: 0 };
	return [
		{ scope: "ORG", tipo: "DIARIO", ...(overrides.orgDaily ?? base) },
		{ scope: "ORG", tipo: "SEMANAL", ...(overrides.orgWeekly ?? base) },
		{ scope: "CAMPANHA", tipo: "DIARIO", ...(overrides.campDaily ?? base) },
		{ scope: "CAMPANHA", tipo: "SEMANAL", ...(overrides.campWeekly ?? base) },
	];
}

test("chaves de janela: dia e semana no fuso do cron", () => {
	// 2026-09-17 01:30 UTC = 2026-09-16 22:30 em São Paulo.
	const keys = getSendQuotaWindowKeys(new Date("2026-09-17T01:30:00.000Z"));
	assert.equal(keys.DIARIO, "2026-09-16");
	assert.match(keys.SEMANAL, /^2026-W\d{2}$/);
	assert.equal(keys.startOfDay.toISOString(), "2026-09-16T03:00:00.000Z");
	// Domingo 13/09 00:00 em São Paulo.
	assert.equal(keys.startOfWeek.toISOString(), "2026-09-13T03:00:00.000Z");
});

test("ordem fixa de contadores: org antes de campanha, diário antes de semanal", () => {
	const order = listSendQuotaCounters({ organizationDaily: 1, organizationWeekly: 2, campaignDaily: 3, campaignWeekly: 4 }).map(
		(c) => `${c.scope}:${c.tipo}`,
	);
	assert.deepEqual(order, ["ORG:DIARIO", "ORG:SEMANAL", "CAMPANHA:DIARIO", "CAMPANHA:SEMANAL"]);
});

test("sem limites, tudo que foi pedido é concedido", () => {
	assert.deepEqual(computeSendQuotaGrant({ counters: counters({}), requested: 250 }), { granted: 250, exhaustedBy: null });
});

test("a janela mais apertada limita e é apontada como motivo", () => {
	const grant = computeSendQuotaGrant({
		counters: counters({ orgWeekly: { limit: 1000, used: 990 }, orgDaily: { limit: 50, used: 45 }, campWeekly: { limit: 100, used: 0 } }),
		requested: 20,
	});
	assert.deepEqual(grant, { granted: 5, exhaustedBy: "QUOTA_ORG_DIARIO" });
});

test("empate entre janelas: a primeira na ordem fixa vence como motivo", () => {
	const grant = computeSendQuotaGrant({
		counters: counters({ orgWeekly: { limit: 10, used: 10 }, campWeekly: { limit: 10, used: 10 } }),
		requested: 3,
	});
	assert.deepEqual(grant, { granted: 0, exhaustedBy: "QUOTA_ORG_SEMANAL" });
});

test("campanha limita antes da organização quando é ela que está sem saldo", () => {
	const grant = computeSendQuotaGrant({
		counters: counters({ orgWeekly: { limit: 1000, used: 0 }, campWeekly: { limit: 30, used: 28 } }),
		requested: 10,
	});
	assert.deepEqual(grant, { granted: 2, exhaustedBy: "QUOTA_CAMPANHA_SEMANAL" });
});

test("uso acima do limite (ajustes tardios) nunca concede negativo", () => {
	const grant = computeSendQuotaGrant({ counters: counters({ orgDaily: { limit: 10, used: 12 } }), requested: 5 });
	assert.deepEqual(grant, { granted: 0, exhaustedBy: "QUOTA_ORG_DIARIO" });
});

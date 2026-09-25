import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiSpendLimitUsd, startOfCurrentMonthInOperationTimezone } from "./spend";

test("startOfCurrentMonthInOperationTimezone usa o mês de São Paulo, não o UTC", () => {
	// 1º de setembro 01:00 UTC ainda é 31 de agosto 22:00 em São Paulo.
	const start = startOfCurrentMonthInOperationTimezone(new Date("2026-09-01T01:00:00.000Z"));
	assert.equal(start.toISOString(), "2026-08-01T03:00:00.000Z");
	const later = startOfCurrentMonthInOperationTimezone(new Date("2026-09-15T12:00:00.000Z"));
	assert.equal(later.toISOString(), "2026-09-01T03:00:00.000Z");
});

test("resolveAiSpendLimitUsd ignora nulo, zero e negativo", () => {
	const base = { recursos: { iaAtendimento: { acesso: true, limiteCreditos: null } } } as never;
	assert.equal(resolveAiSpendLimitUsd(base), null);
	assert.equal(resolveAiSpendLimitUsd({ recursos: { iaAtendimento: { acesso: true, limiteCreditos: 0 } } } as never), null);
	assert.equal(resolveAiSpendLimitUsd({ recursos: { iaAtendimento: { acesso: true, limiteCreditos: 25 } } } as never), 25);
	assert.equal(resolveAiSpendLimitUsd(undefined), null);
});

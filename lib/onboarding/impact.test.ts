import assert from "node:assert/strict";
import test from "node:test";

import { resolveInactivityCutoff } from "./impact";

const NOW = new Date("2026-11-22T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("cobertura completa de 90 dias: corte em 60 dias atrás", () => {
	const cutoff = resolveInactivityCutoff({ coberturaInicio: new Date(NOW.getTime() - 90 * DAY), coberturaParcial: false, now: NOW });
	assert.equal(cutoff?.getTime(), NOW.getTime() - 60 * DAY);
});

test("carga em andamento, sem cobertura ou cobertura curta: nenhum número", () => {
	assert.equal(resolveInactivityCutoff({ coberturaInicio: new Date(NOW.getTime() - 90 * DAY), coberturaParcial: true, now: NOW }), null);
	assert.equal(resolveInactivityCutoff({ coberturaInicio: null, coberturaParcial: false, now: NOW }), null);
	assert.equal(resolveInactivityCutoff({ coberturaInicio: new Date(NOW.getTime() - 30 * DAY), coberturaParcial: false, now: NOW }), null);
});

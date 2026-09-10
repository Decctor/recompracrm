import assert from "node:assert/strict";
import test from "node:test";

import { formatInteractiveDateRangeSummary } from "./interactive-filter-formatting";

test("formats a single-day period without repeating the date", () => {
	const start = new Date(2026, 8, 10, 0, 0, 0);
	const end = new Date(2026, 8, 10, 23, 59, 59);

	assert.equal(formatInteractiveDateRangeSummary(start, end), "10/09/2026");
});

test("keeps an end-of-day ISO value on the selected local date", () => {
	const start = new Date(2026, 8, 1, 0, 0, 0);
	const end = new Date(2026, 8, 10, 23, 59, 59);

	assert.equal(formatInteractiveDateRangeSummary(start.toISOString(), end.toISOString()), "01–10/09/2026");
});

test("omits repeated month and year parts", () => {
	assert.equal(formatInteractiveDateRangeSummary(new Date(2026, 8, 1), new Date(2026, 8, 10)), "01–10/09/2026");
	assert.equal(formatInteractiveDateRangeSummary(new Date(2026, 8, 30), new Date(2026, 9, 2)), "30/09–02/10/2026");
	assert.equal(formatInteractiveDateRangeSummary(new Date(2025, 11, 31), new Date(2026, 0, 2)), "31/12/2025–02/01/2026");
});

test("formats open and empty periods", () => {
	const date = new Date(2026, 8, 10);

	assert.equal(formatInteractiveDateRangeSummary(date, null), "A partir de 10/09/2026");
	assert.equal(formatInteractiveDateRangeSummary(null, date), "Até 10/09/2026");
	assert.equal(formatInteractiveDateRangeSummary(null, null), "TODO PERÍODO");
	assert.equal(formatInteractiveDateRangeSummary(null, null, "Escolha uma data"), "Escolha uma data");
});

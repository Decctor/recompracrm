import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REPORT_PERIOD_PRESETS, UPCOMING_PERIOD_PRESETS, type TPeriodPreset } from "./period-presets";

function preset(list: readonly TPeriodPreset[], id: string) {
	const found = list.find((item) => item.id === id);
	assert.ok(found, `preset ${id} não encontrado`);
	return found;
}

// Sexta-feira, 16/10/2026, 14:30 local.
const reference = new Date(2026, 9, 16, 14, 30, 0, 0);

function local(year: number, monthIndex: number, day: number, end = false) {
	return end ? new Date(year, monthIndex, day, 23, 59, 59, 999) : new Date(year, monthIndex, day, 0, 0, 0, 0);
}

describe("REPORT_PERIOD_PRESETS", () => {
	it("hoje cobre o dia inteiro", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "today").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 16), local(2026, 9, 16, true)]);
	});

	it("ontem é o dia anterior inteiro", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "yesterday").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 15), local(2026, 9, 15, true)]);
	});

	it("esta semana começa no domingo e termina hoje", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "this-week").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 11), local(2026, 9, 16, true)]);
	});

	it("esta semana num domingo é só o domingo", () => {
		const sunday = new Date(2026, 9, 11, 9, 0, 0, 0);
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "this-week").getValue(sunday);
		assert.deepEqual([from, to], [local(2026, 9, 11), local(2026, 9, 11, true)]);
	});

	it("este mês vai do dia 1 até hoje, não até o fim do mês", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "this-month").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 1), local(2026, 9, 16, true)]);
	});

	it("mês anterior é o mês de calendário completo, inclusive na virada do ano", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "previous-month").getValue(new Date(2027, 0, 5, 10, 0, 0, 0));
		assert.deepEqual([from, to], [local(2026, 11, 1), local(2026, 11, 31, true)]);
	});

	it("últimos 30 dias inclui hoje como o trigésimo dia", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "last-30-days").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 8, 17), local(2026, 9, 16, true)]);
	});

	it("este ano vai de 1º de janeiro até hoje", () => {
		const { from, to } = preset(REPORT_PERIOD_PRESETS, "this-year").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 0, 1), local(2026, 9, 16, true)]);
	});

	it("todo atalho termina no fim de um dia e nunca depois da referência", () => {
		for (const item of REPORT_PERIOD_PRESETS) {
			const { from, to } = item.getValue(reference);
			assert.ok(from <= to, `${item.id}: início depois do fim`);
			assert.equal(to.getHours(), 23, `${item.id}: fim fora do fim do dia`);
			assert.equal(to.getMilliseconds(), 999, `${item.id}: fim fora do fim do dia`);
			assert.ok(to <= local(2026, 9, 16, true), `${item.id}: termina no futuro`);
		}
	});
});

describe("UPCOMING_PERIOD_PRESETS", () => {
	it("próximos 7 dias conta hoje como o primeiro", () => {
		const { from, to } = preset(UPCOMING_PERIOD_PRESETS, "next-7-days").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 16), local(2026, 9, 22, true)]);
	});

	it("este mês cobre o mês inteiro, inclusive os dias que ainda vêm", () => {
		const { from, to } = preset(UPCOMING_PERIOD_PRESETS, "this-month").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 9, 1), local(2026, 9, 31, true)]);
	});

	it("próximo mês é o mês de calendário seguinte completo", () => {
		const { from, to } = preset(UPCOMING_PERIOD_PRESETS, "next-month").getValue(new Date(2026, 11, 20));
		assert.deepEqual([from, to], [local(2027, 0, 1), local(2027, 0, 31, true)]);
	});
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	REPORT_PERIOD_PRESETS,
	UPCOMING_PERIOD_PRESETS,
	buildComparisonPeriodPresets,
	countPeriodDays,
	matchPeriodPreset,
	resolveComparisonPeriod,
	toFullDayRange,
	type TPeriodPreset,
} from "./period-presets";

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

describe("buildComparisonPeriodPresets", () => {
	const base = { after: local(2026, 9, 1), before: local(2026, 9, 15, true) };
	const afterOctober = new Date(2026, 10, 5, 10, 0, 0, 0);

	it("período anterior tem a mesma duração e termina 1ms antes do base", () => {
		const { from, to } = preset(buildComparisonPeriodPresets(base), "previous-period").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 8, 16), local(2026, 8, 30, true)]);
	});

	it("mesmo período do mês anterior desloca as duas pontas um mês", () => {
		const { from, to } = preset(buildComparisonPeriodPresets(base), "same-period-previous-month").getValue(reference);
		assert.deepEqual([from, to], [local(2026, 8, 1), local(2026, 8, 15, true)]);
	});

	it("mesmo período do ano anterior desloca as duas pontas um ano", () => {
		const { from, to } = preset(buildComparisonPeriodPresets(base), "same-period-previous-year").getValue(reference);
		assert.deepEqual([from, to], [local(2025, 9, 1), local(2025, 9, 15, true)]);
	});

	it("período anterior de um mês de 31 dias são 31 dias, não o mês de calendário anterior", () => {
		// Para "setembro inteiro" existe o atalho de mês anterior; este é literal na duração.
		const month = { after: local(2026, 9, 1), before: local(2026, 9, 31, true) };
		const { from, to } = preset(buildComparisonPeriodPresets(month), "previous-period").getValue(afterOctober);
		assert.deepEqual([from, to], [local(2026, 7, 31), local(2026, 8, 30, true)]);
	});

	it("mesmo período do mês anterior de um mês inteiro é o mês de calendário anterior inteiro", () => {
		const month = { after: local(2026, 9, 1), before: local(2026, 9, 31, true) };
		const { from, to } = preset(buildComparisonPeriodPresets(month), "same-period-previous-month").getValue(afterOctober);
		assert.deepEqual([from, to], [local(2026, 8, 1), local(2026, 8, 30, true)]);
	});

	it("período em curso: a comparação para no mesmo instante do outro mês, não no fim do dia", () => {
		// "Este mês" às 16:18 do dia 18: o dia de hoje está pela metade, o de outubro também tem de estar.
		const now = new Date(2026, 10, 18, 16, 18, 0, 0);
		const thisMonth = { after: local(2026, 10, 1), before: local(2026, 10, 18, true) };
		const { from, to } = preset(buildComparisonPeriodPresets(thisMonth), "same-period-previous-month").getValue(now);
		assert.deepEqual([from, to], [local(2026, 9, 1), new Date(2026, 9, 18, 16, 18, 0, 0)]);
	});

	it("período em curso: o período anterior tem a duração decorrida até agora", () => {
		const now = new Date(2026, 10, 2, 12, 0, 0, 0);
		const thisMonth = { after: local(2026, 10, 1), before: local(2026, 10, 2, true) };
		const { from, to } = preset(buildComparisonPeriodPresets(thisMonth), "previous-period").getValue(now);
		// 36h decorridas → as 36h antes de 01/11 (a janela termina 1ms antes do início do base).
		assert.deepEqual([from, to], [new Date(2026, 9, 30, 11, 59, 59, 999), new Date(2026, 9, 31, 23, 59, 59, 999)]);
	});

	it("1º a 17 de novembro, já encerrado, compara com 1º a 17 de outubro", () => {
		const base = { after: local(2026, 10, 1), before: local(2026, 10, 17, true) };
		const { from, to } = preset(buildComparisonPeriodPresets(base), "same-period-previous-month").getValue(new Date(2026, 10, 18, 16, 18));
		assert.deepEqual([from, to], [local(2026, 9, 1), local(2026, 9, 17, true)]);
	});
});

describe("resolveComparisonPeriod", () => {
	const base = { after: local(2026, 10, 1), before: local(2026, 10, 17, true) };
	const now = new Date(2026, 10, 18, 16, 18);

	it("atalho guarda a regra: as datas acompanham o período base", () => {
		const selection = { kind: "preset", presetId: "same-period-previous-month" } as const;
		assert.deepEqual(resolveComparisonPeriod(selection, base, now), { after: local(2026, 9, 1), before: local(2026, 9, 17, true) });
		const otherBase = { after: local(2026, 8, 10), before: local(2026, 8, 20, true) };
		assert.deepEqual(resolveComparisonPeriod(selection, otherBase, now), { after: local(2026, 7, 10), before: local(2026, 7, 20, true) });
	});

	it("personalizado devolve as próprias datas, e sem comparação devolve null", () => {
		const custom = { kind: "custom", after: local(2026, 0, 3), before: local(2026, 0, 9, true) } as const;
		assert.deepEqual(resolveComparisonPeriod(custom, base, now), { after: custom.after, before: custom.before });
		assert.equal(resolveComparisonPeriod({ kind: "none" }, base, now), null);
	});
});

describe("countPeriodDays", () => {
	it("conta 1º a 17 como 17 dias, não 16", () => {
		assert.equal(countPeriodDays({ after: local(2026, 10, 1), before: local(2026, 10, 17, true) }), 17);
	});

	it("um dia só é um dia", () => {
		assert.equal(countPeriodDays({ after: local(2026, 10, 1), before: local(2026, 10, 1, true) }), 1);
	});

	it("o dia em curso conta como um dia", () => {
		assert.equal(countPeriodDays({ after: local(2026, 9, 1), before: new Date(2026, 9, 18, 16, 18) }), 18);
	});
});

describe("matchPeriodPreset", () => {
	it("reconhece o atalho pelo recorte, ignorando a hora", () => {
		const match = matchPeriodPreset(REPORT_PERIOD_PRESETS, { after: local(2026, 9, 1, true), before: local(2026, 9, 16) }, reference);
		assert.equal(match?.id, "this-month");
	});

	it("devolve null para um recorte que não é atalho", () => {
		const match = matchPeriodPreset(REPORT_PERIOD_PRESETS, { after: local(2026, 9, 3), before: local(2026, 9, 9, true) }, reference);
		assert.equal(match, null);
	});
});

describe("toFullDayRange", () => {
	const midnight = (day: number) => new Date(2026, 10, day);

	it("um dia só (primeiro clique: from = to = meia-noite) cobre o dia inteiro", () => {
		const range = toFullDayRange({ from: midnight(12), to: midnight(12) });
		assert.deepEqual(range.from, new Date(2026, 10, 12, 0, 0, 0, 0));
		assert.deepEqual(range.to, new Date(2026, 10, 12, 23, 59, 59, 999));
	});

	it("intervalo vai do início do primeiro ao fim do último dia", () => {
		const range = toFullDayRange({ from: midnight(10), to: midnight(14) });
		assert.deepEqual(range.from, new Date(2026, 10, 10, 0, 0, 0, 0));
		assert.deepEqual(range.to, new Date(2026, 10, 14, 23, 59, 59, 999));
	});

	it("sem fim, vale o dia do início", () => {
		assert.deepEqual(toFullDayRange({ from: midnight(12) }).to, new Date(2026, 10, 12, 23, 59, 59, 999));
	});

	it("idempotente: um atalho (já em dias inteiros) passa igual", () => {
		const today = REPORT_PERIOD_PRESETS[0].getValue(new Date(2026, 10, 12, 15, 30));
		assert.deepEqual(toFullDayRange(today), today);
	});

	it("seleção desfeita continua vazia", () => {
		assert.deepEqual(toFullDayRange(undefined), { from: undefined, to: undefined });
	});
});

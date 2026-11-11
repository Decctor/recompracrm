import assert from "node:assert/strict";
import test from "node:test";
import dayjs from "dayjs";
import { CAMPAIGN_STATS_PERIOD_PRESETS, matchCampaignStatsPeriodPreset, resolveCampaignStatsComparisonPeriod } from "./stats-period";

test("mês inteiro compara com o mês anterior inteiro, incluindo o dia 31", () => {
	const comparing = resolveCampaignStatsComparisonPeriod({
		startDate: dayjs("2026-11-01").toDate(),
		endDate: dayjs("2026-11-30").endOf("day").toDate(),
	});
	assert.equal(dayjs(comparing.startDate).format("YYYY-MM-DD"), "2026-10-01");
	assert.equal(dayjs(comparing.endDate).format("YYYY-MM-DD HH:mm"), "2026-10-31 23:59");
});

test("trimestre compara com o trimestre anterior", () => {
	const comparing = resolveCampaignStatsComparisonPeriod({
		startDate: dayjs("2026-10-01").toDate(),
		endDate: dayjs("2026-12-31").endOf("day").toDate(),
	});
	assert.equal(dayjs(comparing.startDate).format("YYYY-MM-DD"), "2026-07-01");
	assert.equal(dayjs(comparing.endDate).format("YYYY-MM-DD"), "2026-09-30");
});

test("recorte livre compara com a janela de mesma duração logo antes", () => {
	const comparing = resolveCampaignStatsComparisonPeriod({
		startDate: dayjs("2026-11-13").toDate(),
		endDate: dayjs("2026-11-11").add(30, "day").endOf("day").toDate(),
	});
	// 13/11 a 11/12 = 29 dias → 15/10 a 12/11
	assert.equal(dayjs(comparing.startDate).format("YYYY-MM-DD"), "2026-10-15");
	assert.equal(dayjs(comparing.endDate).format("YYYY-MM-DD HH:mm"), "2026-11-12 23:59");
});

test("atalhos: trimestre é o trimestre de calendário e o atalho é reconhecido de volta", () => {
	const reference = dayjs("2026-11-11").toDate();
	const quarter = CAMPAIGN_STATS_PERIOD_PRESETS.find((preset) => preset.id === "this-quarter")?.getValue(reference);
	assert.equal(dayjs(quarter?.startDate).format("YYYY-MM-DD"), "2026-10-01");
	assert.equal(dayjs(quarter?.endDate).format("YYYY-MM-DD"), "2026-12-31");
	assert.equal(quarter && matchCampaignStatsPeriodPreset(quarter, reference), "this-quarter");
});

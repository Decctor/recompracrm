import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dayjs from "dayjs";
import { findChartBucketIndex, getChartBuckets, getChartGranularity, localDayKeyToTime, shiftChartBuckets } from "./period-buckets";

// Datas como o front manda: início do dia e fim do dia em São Paulo (UTC-3).
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("getChartBuckets", () => {
	it("um ano inteiro vira 12 meses alinhados à virada local", () => {
		const buckets = getChartBuckets({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-12-31T23:59:59.999") });
		assert.equal(getChartGranularity({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-12-31T23:59:59.999") }), "month");
		assert.deepEqual(
			buckets.map((bucket) => bucket.label),
			["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((month) => `${month}/2026`),
		);
		assert.equal(new Date(buckets[1].start).toISOString(), "2026-02-01T03:00:00.000Z");
		assert.equal(new Date(buckets[11].end).toISOString(), "2027-01-01T03:00:00.000Z");
	});

	it("a venda das 23h30 do último dia do mês (já 02h30 UTC do dia 1º) fica no mês certo", () => {
		const buckets = getChartBuckets({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-12-31T23:59:59.999") });
		assert.equal(buckets[findChartBucketIndex(buckets, sp("2026-01-31T23:30:00.000"))].label, "01/2026");
		assert.equal(buckets[findChartBucketIndex(buckets, sp("2026-02-01T00:00:00.000"))].label, "02/2026");
		assert.equal(findChartBucketIndex(buckets, sp("2025-12-31T23:59:59.000")), -1);
		assert.equal(findChartBucketIndex(buckets, sp("2027-01-01T00:00:00.000")), -1);
	});

	it("um mês vira um ponto por dia", () => {
		const buckets = getChartBuckets({ startDate: sp("2026-11-01T00:00:00.000"), endDate: sp("2026-11-30T23:59:59.999") });
		assert.equal(buckets.length, 30);
		assert.equal(buckets[0].label, "01/11");
		assert.equal(buckets[29].label, "30/11");
		assert.equal(buckets[findChartBucketIndex(buckets, sp("2026-11-06T22:00:00.000"))].label, "06/11");
	});

	it("um dia vira 24 horas com rótulo local", () => {
		const buckets = getChartBuckets({ startDate: sp("2026-11-06T00:00:00.000"), endDate: sp("2026-11-06T23:59:59.999") });
		assert.equal(buckets.length, 24);
		assert.equal(buckets[0].label, "00:00");
		assert.equal(buckets[findChartBucketIndex(buckets, sp("2026-11-06T21:15:00.000"))].label, "21:00");
	});

	it("semanas começam na segunda, com a primeira cortada no início do período", () => {
		// 01/01/2026 é quinta-feira.
		const buckets = getChartBuckets({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-05-31T23:59:59.999") });
		assert.equal(getChartGranularity({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-05-31T23:59:59.999") }), "week");
		assert.equal(buckets[0].label, "01/01");
		assert.equal(buckets[1].label, "05/01");
		assert.equal(dayjs(buckets[1].start).tz("America/Sao_Paulo").day(), 1);
		assert.equal(new Date(buckets.at(-1)!.end).toISOString(), "2026-06-01T03:00:00.000Z");
	});

	it("intervalos são contíguos e cobrem o período inteiro", () => {
		const startDate = sp("2026-03-14T10:00:00.000");
		const endDate = sp("2026-09-02T18:00:00.000");
		const buckets = getChartBuckets({ startDate, endDate });
		assert.equal(buckets[0].start, startDate.getTime());
		assert.equal(buckets.at(-1)!.end, endDate.getTime() + 1);
		for (let index = 1; index < buckets.length; index++) assert.equal(buckets[index].start, buckets[index - 1].end);
	});

	it("período inválido não gera intervalos", () => {
		assert.deepEqual(getChartBuckets({ startDate: sp("2026-02-01T00:00:00.000"), endDate: sp("2026-01-01T00:00:00.000") }), []);
	});
});

describe("shiftChartBuckets", () => {
	it("o ano anterior mantém os rótulos do período base", () => {
		const buckets = getChartBuckets({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-12-31T23:59:59.999") });
		const previous = shiftChartBuckets(buckets, (date) => dayjs(date).subtract(1, "year").toDate());
		assert.equal(previous[2].label, "03/2026");
		assert.equal(new Date(previous[2].start).toISOString(), "2025-03-01T03:00:00.000Z");
		assert.equal(previous[findChartBucketIndex(previous, sp("2025-03-15T12:00:00.000"))].label, "03/2026");
	});
});

describe("localDayKeyToTime", () => {
	it("a chave do dia local cai no mês do dia local", () => {
		assert.equal(new Date(localDayKeyToTime("2026-01-31")).toISOString(), "2026-01-31T03:00:00.000Z");
		const buckets = getChartBuckets({ startDate: sp("2026-01-01T00:00:00.000"), endDate: sp("2026-12-31T23:59:59.999") });
		assert.equal(buckets[findChartBucketIndex(buckets, localDayKeyToTime("2026-01-31"))].label, "01/2026");
		assert.equal(buckets[findChartBucketIndex(buckets, localDayKeyToTime("2026-01-01"))].label, "01/2026");
	});
});

import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Um intervalo do gráfico: `[start, end)` em epoch ms, com o rótulo já formatado no fuso da operação. */
export type TChartBucket = { label: string; start: number; end: number };
export type TChartGranularity = "hour" | "6-hours" | "day" | "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Granularidade pelo tamanho do período: o mais fino que ainda cabe legível num gráfico.
 * Um ano inteiro vira 12 meses — não 365 dias, que é ruído numa tela e não responde "como foi cada mês".
 */
export function getChartGranularity({ startDate, endDate }: { startDate: Date; endDate: Date }): TChartGranularity {
	const span = endDate.getTime() - startDate.getTime();
	if (span <= 2 * DAY_MS) return "hour";
	if (span <= 7 * DAY_MS) return "6-hours";
	if (span <= 62 * DAY_MS) return "day";
	if (span <= 200 * DAY_MS) return "week";
	return "month";
}

/**
 * Intervalos do gráfico alinhados ao calendário do fuso da operação.
 *
 * Substitui os "pontos igualmente espaçados" (`getEvenlySpacedDates` + `getDateBuckets`): aqueles
 * dividiam o período em fatias de tamanho igual, que não caem na virada de dia nem de mês. Com 12
 * pontos num ano, cada fatia tinha ~33 dias e o rótulo "02/2026" somava vendas de fevereiro e de
 * março; com 365 pontos, a fatia era 1,0027 dia e o rótulo do dia escorregava algumas horas ao longo
 * do ano. Aqui cada intervalo começa na virada real (00:00 em São Paulo, dia 1º do mês, segunda-feira
 * da semana), o primeiro e o último são cortados nas bordas do período, e os rótulos saem no fuso da
 * operação — não no do servidor (UTC).
 */
export function getChartBuckets({
	startDate,
	endDate,
	granularity = getChartGranularity({ startDate, endDate }),
	timeZone = OPERATION_TIMEZONE,
}: {
	startDate: Date;
	endDate: Date;
	granularity?: TChartGranularity;
	timeZone?: string;
}): TChartBucket[] {
	const startMs = startDate.getTime();
	// O fim do período costuma vir como 23:59:59.999; o intervalo é aberto à direita, então +1ms.
	const endMs = endDate.getTime() + 1;
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

	const labelFormat = getLabelFormat({ granularity, startDate, endDate, timeZone });
	const buckets: TChartBucket[] = [];
	// Itera em "hora de parede" (UTC puro, sem fuso) e só converte cada virada para um instante no
	// fuso da operação — somar meses/dias num objeto com fuso arrasta o deslocamento errado em DST.
	let wall = floorWallClock(dayjs(startDate).tz(timeZone), granularity);
	while (true) {
		const bucketStart = wallToInstant(wall, timeZone);
		if (bucketStart >= endMs) break;
		const nextWall = stepWallClock(wall, granularity);
		const bucketEnd = wallToInstant(nextWall, timeZone);
		const start = Math.max(bucketStart, startMs);
		const end = Math.min(bucketEnd, endMs);
		if (end > start) buckets.push({ label: dayjs(start).tz(timeZone).format(labelFormat), start, end });
		wall = nextWall;
	}
	return buckets;
}

/** Índice do intervalo que contém `time` (busca binária), ou -1 fora do período. */
export function findChartBucketIndex(buckets: TChartBucket[], time: number | Date | string): number {
	const t = typeof time === "number" ? time : new Date(time).getTime();
	let low = 0;
	let high = buckets.length - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		const bucket = buckets[middle];
		if (t < bucket.start) high = middle - 1;
		else if (t >= bucket.end) low = middle + 1;
		else return middle;
	}
	return -1;
}

/**
 * Instante de início de um dia local (`YYYY-MM-DD`, a chave de `localDayKey`) no fuso da operação.
 * É a ponte entre a série pré-agregada por dia no banco e `findChartBucketIndex`.
 */
export function localDayKeyToTime(dayKey: string, timeZone = OPERATION_TIMEZONE): number {
	return dayjs.tz(`${dayKey.slice(0, 10)}T00:00:00`, timeZone).valueOf();
}

/** Desloca os intervalos (ex.: o mesmo período no ano anterior), mantendo os rótulos do período base. */
export function shiftChartBuckets(buckets: TChartBucket[], shift: (date: Date) => Date): TChartBucket[] {
	return buckets.map((bucket) => ({
		label: bucket.label,
		start: shift(new Date(bucket.start)).getTime(),
		end: shift(new Date(bucket.end)).getTime(),
	}));
}

function getLabelFormat({
	granularity,
	startDate,
	endDate,
	timeZone,
}: {
	granularity: TChartGranularity;
	startDate: Date;
	endDate: Date;
	timeZone: string;
}) {
	switch (granularity) {
		case "hour":
			return dayjs(startDate).tz(timeZone).isSame(dayjs(endDate).tz(timeZone), "day") ? "HH:mm" : "DD/MM HH:mm";
		case "6-hours":
			return "DD/MM HH:mm";
		case "day":
		case "week":
			return "DD/MM";
		case "month":
			return "MM/YYYY";
	}
}

/** Hora de parede no fuso, como um `Dayjs` em UTC puro, arredondada para baixo na unidade. */
function floorWallClock(local: Dayjs, granularity: TChartGranularity): Dayjs {
	const wall = dayjs.utc(local.format("YYYY-MM-DDTHH:mm:ss"));
	switch (granularity) {
		case "hour":
			return wall.startOf("hour");
		case "6-hours":
			return wall.startOf("hour").hour(Math.floor(wall.hour() / 6) * 6);
		case "day":
			return wall.startOf("day");
		case "week":
			// Semana começando na segunda-feira (`day()` = 0 é domingo).
			return wall.startOf("day").subtract((wall.day() + 6) % 7, "day");
		case "month":
			return wall.startOf("month");
	}
}

function stepWallClock(wall: Dayjs, granularity: TChartGranularity): Dayjs {
	switch (granularity) {
		case "hour":
			return wall.add(1, "hour");
		case "6-hours":
			return wall.add(6, "hour");
		case "day":
			return wall.add(1, "day");
		case "week":
			return wall.add(1, "week");
		case "month":
			return wall.add(1, "month");
	}
}

function wallToInstant(wall: Dayjs, timeZone: string) {
	return dayjs.tz(wall.format("YYYY-MM-DDTHH:mm:ss"), timeZone).valueOf();
}

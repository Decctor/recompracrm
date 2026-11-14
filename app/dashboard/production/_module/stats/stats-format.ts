import type { TChartGranularity } from "@/lib/charts/period-buckets";
import type { TStatsPeriod } from "@/lib/campaigns/stats-period";
import { formatDecimalPlaces } from "@/lib/formatting";
import dayjs from "dayjs";

/**
 * Formatação das estatísticas de produção. A API devolve unidades normalizadas em caixa alta ("KG",
 * "L", "UN"); a tela escreve "kg", "L", "un", como nas fichas.
 */

export type TUnitQuantity = { unidade: string; quantidade: number };

export function formatUnitLabel(unit: string) {
	return unit === "L" ? "L" : unit.toLowerCase();
}

/** "226,5 kg", "120 un". Unidade contável não ganha casa decimal obrigatória. */
export function formatUnitQuantity(value: number, unit: string) {
	const minPlaces = unit === "UN" ? 0 : 1;
	return `${formatDecimalPlaces(value, minPlaces, 2)} ${formatUnitLabel(unit)}`;
}

/** Quantidade de uma unidade numa lista por unidade — nunca soma unidades diferentes. */
export function quantityInUnit(list: TUnitQuantity[], unit: string | null) {
	if (!unit) return 0;
	return list.find((item) => item.unidade === unit)?.quantidade ?? 0;
}

/** Razão (1 = 100%) como porcentagem com uma casa: 0.991 → "99,1%". Sem razão, "—". */
export function formatRatioPercent(ratio: number | null | undefined) {
	if (ratio == null) return "—";
	return `${formatDecimalPlaces(ratio * 100, 1, 1)}%`;
}

/** Iniciais do insumo para o selo: "Pasta de pistache" → "PP", "Açúcar" → "A". */
export function getInputInitials(name: string) {
	const words = name.split(/\s+/).filter((word) => word.length > 2 || /^[A-ZÀ-Ý0-9]/.test(word));
	const initials = words
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");
	return initials || name.slice(0, 2).toUpperCase();
}

/**
 * Posição de `at` na série do período (0 = primeiro intervalo), na mesma granularidade que a API usa
 * para montar os pontos. Serve só para cortar a linha no "agora" e a série de comparação no fim do
 * período dela — não para agregar, então a hora local do navegador basta.
 */
export function getBucketOffset(start: Date, at: Date, granularity: TChartGranularity) {
	const from = dayjs(start);
	const to = dayjs(at);
	switch (granularity) {
		case "hour":
			return to.startOf("hour").diff(from.startOf("hour"), "hour");
		case "6-hours": {
			const slot = (date: dayjs.Dayjs) => date.startOf("day").diff(from.startOf("day"), "day") * 4 + Math.floor(date.hour() / 6);
			return slot(to) - slot(from);
		}
		case "day":
			return to.startOf("day").diff(from.startOf("day"), "day");
		case "week": {
			const monday = from.startOf("day").subtract((from.day() + 6) % 7, "day");
			return Math.floor(to.startOf("day").diff(monday, "day") / 7);
		}
		case "month":
			return to.startOf("month").diff(from.startOf("month"), "month");
	}
}

/** Quantos intervalos do período já começaram em `now` (todos, se o período já acabou). */
export function getElapsedBucketCount(period: TStatsPeriod, granularity: TChartGranularity, total: number, now = new Date()) {
	if (now >= period.endDate) return total;
	if (now < period.startDate) return 0;
	return Math.min(total, getBucketOffset(period.startDate, now, granularity) + 1);
}

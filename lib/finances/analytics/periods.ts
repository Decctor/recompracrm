import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Janela imediatamente anterior de duração idêntica: termina 1ms antes do início do período atual.
 * É a base de toda comparação período-a-período dos relatórios financeiros.
 */
export function getPreviousPeriod(period: { after: Date; before: Date }) {
	const durationMs = period.before.getTime() - period.after.getTime();
	return {
		after: new Date(period.after.getTime() - 1 - durationMs),
		before: new Date(period.after.getTime() - 1),
	};
}

/**
 * Chaves "YYYY-MM" dos 12 meses que encerram no mês de `before`, em ordem cronológica. Mês no fuso
 * da operação: o fim de outubro em São Paulo (23:59 −03:00) já é 1º de novembro em UTC.
 */
export function getTrailingMonthKeys(before: Date, months = 12) {
	const seriesEnd = dayjs(before).tz(OPERATION_TIMEZONE).endOf("month");
	const seriesStart = seriesEnd.subtract(months - 1, "month").startOf("month");
	const keys: string[] = [];
	for (let monthOffset = 0; monthOffset < months; monthOffset++) {
		keys.push(seriesStart.add(monthOffset, "month").format("YYYY-MM"));
	}
	return keys;
}

/** Limites (Date) da série de `getTrailingMonthKeys`, para filtrar a query agregada. */
export function getTrailingMonthsRange(before: Date, months = 12) {
	const seriesEnd = dayjs(before).tz(OPERATION_TIMEZONE).endOf("month");
	const seriesStart = seriesEnd.subtract(months - 1, "month").startOf("month");
	return { after: seriesStart.toDate(), before: seriesEnd.toDate() };
}

import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";

const DAY_MS = 86_400_000;

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATION_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia local da operação (`YYYY-MM-DD`), a mesma chave que `localDayKey` produz no SQL. */
export function toLocalDayKey(date: Date) {
	return dayKeyFormatter.format(date);
}

/**
 * Dias locais de `after` até `before`, inclusive, em ordem. Caminha de 12 em 12 horas e deduplica para
 * atravessar mudanças de horário sem pular nem repetir um dia.
 */
export function listLocalDayKeys(after: Date, before: Date) {
	const keys: string[] = [];
	const last = toLocalDayKey(before);
	for (let time = after.getTime(); ; time += DAY_MS / 2) {
		const key = toLocalDayKey(new Date(time));
		if (keys[keys.length - 1] !== key) keys.push(key);
		if (key >= last || time > before.getTime()) break;
	}
	return keys;
}

/** Dias inteiros entre duas datas (pode ser negativo). */
export function diffInDays(from: Date, to: Date) {
	return (to.getTime() - from.getTime()) / DAY_MS;
}

export function addDays(date: Date, days: number) {
	return new Date(date.getTime() + days * DAY_MS);
}

/** Período móvel terminando agora: `[agora - dias, agora]`. */
export function getTrailingPeriod(days: number, now = new Date()) {
	return { after: addDays(now, -days), before: now };
}

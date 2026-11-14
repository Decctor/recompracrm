import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import dayjs from "dayjs";

/** Quantidade sem unidade: inteiros para UN, até 3 casas para o resto (pesagem em KG/L). */
export function formatQuantityNumber(value: number, unit: string) {
	return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: unit === "UN" ? 0 : 3 });
}

export function formatQuantity(value: number, unit: string) {
	return `${formatQuantityNumber(value, unit)} ${unit}`;
}

/** Texto editável do stepper de quantidade: vírgula decimal, sem separador de milhar. */
export function formatQuantityDraft(value: number) {
	return value.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
}

export function formatDayMonth(value: Date | string | null | undefined) {
	if (!value) return null;
	const date = dayjs(value);
	return date.isValid() ? date.format("DD/MM") : null;
}

const DAYJS_UNITS: Record<TTimeDurationUnitsEnum, dayjs.ManipulateType> = {
	MINUTOS: "minute",
	HORAS: "hour",
	DIAS: "day",
	SEMANAS: "week",
	MESES: "month",
	ANOS: "year",
};

export function addDuration(date: Date, valor: number, medida: TTimeDurationUnitsEnum) {
	return dayjs(date).add(valor, DAYJS_UNITS[medida]).toDate();
}

const DURATION_LABELS: Record<TTimeDurationUnitsEnum, [singular: string, plural: string]> = {
	MINUTOS: ["min", "min"],
	HORAS: ["h", "h"],
	DIAS: ["dia", "dias"],
	SEMANAS: ["semana", "semanas"],
	MESES: ["mês", "meses"],
	ANOS: ["ano", "anos"],
};

/** "45 min", "2 h", "1,5 h", "15 dias". Minutos a partir de uma hora viram horas, como no card da receita. */
export function formatDuration(valor: number, medida: TTimeDurationUnitsEnum) {
	if (medida === "MINUTOS" && valor >= 60) return formatDuration(valor / 60, "HORAS");
	const [singular, plural] = DURATION_LABELS[medida];
	return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${valor === 1 ? singular : plural}`;
}

/** Iniciais do item na miniatura (palavras com mais de duas letras, até duas). */
export function getItemInitials(name: string) {
	const initials = name
		.split(" ")
		.filter((word) => word.length > 2)
		.slice(0, 2)
		.map((word) => word[0])
		.join("")
		.toUpperCase();
	return initials || name.slice(0, 2).toUpperCase();
}

export function formatPercent(fraction: number) {
	return `${Math.round(fraction * 100)}%`;
}

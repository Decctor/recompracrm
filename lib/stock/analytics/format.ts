import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";

// Formatação dos relatórios de estoque. As chaves de dia (`YYYY-MM-DD`) já estão no fuso da
// operação: viram data ao meio-dia local só para formatar, sem risco de cair no dia vizinho.

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad = (value: number) => String(value).padStart(2, "0");

export function dayKeyToDate(dia: string) {
	const [year, month, day] = dia.split("-").map(Number);
	return new Date(year, month - 1, day, 12);
}

/** "18 out" */
export function formatDayShort(dia: string) {
	const date = dayKeyToDate(dia);
	return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "out" */
export function formatMonthShort(dia: string) {
	return MONTHS[dayKeyToDate(dia).getMonth()];
}

/** "18/10/2026" */
export function formatDayFull(dia: string) {
	const date = dayKeyToDate(dia);
	return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "18/10" */
export function formatDayMonth(date: Date | number) {
	const value = new Date(date);
	return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}`;
}

/** "18/10/2026" a partir de um instante, no fuso do navegador. */
export function formatDate(date: Date | number) {
	const value = new Date(date);
	return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
}

/** "18/10/2026 09:40" */
export function formatDateTime(date: Date | number) {
	const value = new Date(date);
	return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Eixo de valores: "R$ 56 mil" a partir de R$ 10 mil, valor inteiro abaixo disso. */
export function formatCompactMoney(value: number) {
	if (Math.abs(value) >= 10_000) return `R$ ${formatDecimalPlaces(value / 1000, 0, 0)} mil`;
	return `R$ ${formatDecimalPlaces(value, 0, 0)}`;
}

export function formatMoney(value: number) {
	return formatToMoney(value);
}

/** Valor com sinal explícito: "+R$ 1.200,00" / "−R$ 412,70". */
export function formatSignedMoney(value: number) {
	return `${value >= 0 ? "+" : "−"}${formatToMoney(Math.abs(value))}`;
}

export function formatQuantity(value: number, maxPlaces = 2) {
	return formatDecimalPlaces(value, 0, maxPlaces);
}

/** Fração (0–1) como porcentagem: 0.312 → "31,2%". */
export function formatFraction(value: number, places = 0) {
	return `${formatDecimalPlaces(value * 100, places, places)}%`;
}

/** Diferença de porcentagem em pontos percentuais com sinal: "+1,4 p.p.". */
export function formatPercentagePoints(fractionDelta: number) {
	const points = fractionDelta * 100;
	return `${points > 0 ? "+" : points < 0 ? "−" : ""}${formatDecimalPlaces(Math.abs(points), 1, 1)} p.p.`;
}

/** Variação relativa com sinal: 0.057 → "+5,7%". */
export function formatSignedFraction(value: number, places = 1) {
	return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatDecimalPlaces(Math.abs(value) * 100, places, places)}%`;
}

export function formatDays(value: number | null, { cap = 60 }: { cap?: number } = {}) {
	if (value == null) return "Sem consumo";
	if (value > cap) return `${cap}+ dias`;
	const formatted = formatDecimalPlaces(value, 0, value < 10 ? 1 : 0);
	return `${formatted} ${value === 1 ? "dia" : "dias"}`;
}

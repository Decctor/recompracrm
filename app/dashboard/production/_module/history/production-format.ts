import dayjs from "dayjs";

/**
 * Formatação compartilhada pelas listagens de Produções (Histórico e Receitas). Unidades vêm do
 * cadastro do produto em caixa alta ("KG", "UN"); na tela, as de massa e volume seguem a grafia
 * usual ("kg", "L") e as de contagem viram minúsculas.
 */

const UNIT_LABELS: Record<string, string> = { KG: "kg", G: "g", MG: "mg", L: "L", ML: "mL", UN: "un" };
const FRACTIONAL_UNITS = new Set(["KG", "G", "MG", "L", "ML"]);

export function formatProductionUnit(unidade: string | null | undefined) {
	if (!unidade) return "";
	return UNIT_LABELS[unidade.toUpperCase()] ?? unidade.toLowerCase();
}

/** "5,0 kg", "1,25 L", "177 un". Massa e volume sempre com uma casa; contagem só quando fracionada. */
export function formatProductionQuantity(value: number, unidade: string | null | undefined) {
	const isFractionalUnit = !!unidade && FRACTIONAL_UNITS.has(unidade.toUpperCase());
	const number = value.toLocaleString("pt-BR", { minimumFractionDigits: isFractionalUnit ? 1 : 0, maximumFractionDigits: 2 });
	const unit = formatProductionUnit(unidade);
	return unit ? `${number} ${unit}` : number;
}

/** "14/11" no ano corrente, "14/11/2025" fora dele. */
export function formatProductionDay(date: Date | string) {
	const parsed = dayjs(date);
	return parsed.year() === dayjs().year() ? parsed.format("DD/MM") : parsed.format("DD/MM/YYYY");
}

/** "45 min", "1h", "1h 20min", "2d 3h". */
export function formatMinutesAsDuration(totalMinutes: number) {
	const minutes = Math.max(0, Math.round(totalMinutes));
	if (minutes < 60) return `${minutes} min`;
	if (minutes < 1440) {
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return rest ? `${hours}h ${rest}min` : `${hours}h`;
	}
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	return hours ? `${days}d ${hours}h` : `${days}d`;
}

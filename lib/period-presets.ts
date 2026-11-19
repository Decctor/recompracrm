import dayjs from "dayjs";

/**
 * Atalhos de período compartilhados por todo seletor de intervalo de datas do painel.
 *
 * Existia um conjunto por tela (janelas móveis num lugar, meses de calendário noutro, "ÚLTIMO MÊS"
 * querendo dizer "últimos 30 dias"). O usuário compara resultados por mês e semana de calendário,
 * então o conjunto padrão prioriza recortes alinhados ao calendário e deixa uma única janela móvel
 * por último, com o rótulo dizendo exatamente o que ela é.
 *
 * Tudo aqui é hora local do navegador; o fim de um atalho é sempre o fim do dia (23:59:59.999).
 * A semana começa no domingo, como a grade do calendário.
 */
export type TPeriodPreset = {
	id: string;
	label: string;
	getValue: (referenceDate: Date) => { from: Date; to: Date };
};

/**
 * Intervalo escolhido no calendário, em dias inteiros. O calendário devolve datas à meia-noite — e o
 * primeiro clique já devolve `{ from: dia, to: dia }` —, então um dia só virava o instante
 * [00:00, 00:00] e o filtro não achava nada. Aqui o início vai para 00:00 e o fim para 23:59:59.999,
 * como nos atalhos acima. Sem `to`, o intervalo é o próprio dia de `from`.
 */
export function toFullDayRange(range: { from?: Date | null; to?: Date | null } | null | undefined): { from?: Date; to?: Date } {
	const from = range?.from ?? undefined;
	const to = range?.to ?? from;
	return {
		from: from ? dayjs(from).startOf("day").toDate() : undefined,
		to: to ? dayjs(to).endOf("day").toDate() : undefined,
	};
}

function startOfWeek(referenceDate: Date) {
	const day = dayjs(referenceDate).startOf("day");
	return day.subtract(day.day(), "day");
}

/** Padrão dos relatórios e listagens: recortes do passado até hoje. */
export const REPORT_PERIOD_PRESETS: readonly TPeriodPreset[] = [
	{
		id: "today",
		label: "HOJE",
		getValue: (ref) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
	{
		id: "yesterday",
		label: "ONTEM",
		getValue: (ref) => ({
			from: dayjs(ref).subtract(1, "day").startOf("day").toDate(),
			to: dayjs(ref).subtract(1, "day").endOf("day").toDate(),
		}),
	},
	{
		id: "this-week",
		label: "ESTA SEMANA",
		getValue: (ref) => ({ from: startOfWeek(ref).toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
	{
		id: "this-month",
		label: "ESTE MÊS",
		getValue: (ref) => ({ from: dayjs(ref).startOf("month").toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
	{
		id: "previous-month",
		label: "MÊS ANTERIOR",
		getValue: (ref) => ({
			from: dayjs(ref).subtract(1, "month").startOf("month").toDate(),
			to: dayjs(ref).subtract(1, "month").endOf("month").toDate(),
		}),
	},
	{
		id: "last-30-days",
		label: "ÚLTIMOS 30 DIAS",
		getValue: (ref) => ({ from: dayjs(ref).subtract(29, "day").startOf("day").toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
	{
		id: "this-year",
		label: "ESTE ANO",
		getValue: (ref) => ({ from: dayjs(ref).startOf("year").toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
];

/** Recortes do futuro ("quem faz aniversário em breve"), para datas que ainda vão acontecer. */
export const UPCOMING_PERIOD_PRESETS: readonly TPeriodPreset[] = [
	{
		id: "today",
		label: "HOJE",
		getValue: (ref) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).endOf("day").toDate() }),
	},
	{
		id: "next-7-days",
		label: "PRÓXIMOS 7 DIAS",
		getValue: (ref) => ({ from: dayjs(ref).startOf("day").toDate(), to: dayjs(ref).add(6, "day").endOf("day").toDate() }),
	},
	{
		id: "this-month",
		label: "ESTE MÊS",
		getValue: (ref) => ({ from: dayjs(ref).startOf("month").toDate(), to: dayjs(ref).endOf("month").toDate() }),
	},
	{
		id: "next-month",
		label: "PRÓXIMO MÊS",
		getValue: (ref) => ({
			from: dayjs(ref).add(1, "month").startOf("month").toDate(),
			to: dayjs(ref).add(1, "month").endOf("month").toDate(),
		}),
	},
];

export const COMPARISON_PRESET_IDS = ["previous-period", "same-period-previous-month", "same-period-previous-year"] as const;
export type TComparisonPresetId = (typeof COMPARISON_PRESET_IDS)[number];
export type TComparisonPeriodPreset = TPeriodPreset & { id: TComparisonPresetId };

/** "Mês anterior" é o que as pessoas leem num card de comparação, então é a regra de partida. */
export const DEFAULT_COMPARISON_PRESET_ID: TComparisonPresetId = "same-period-previous-month";

/**
 * Referências para comparar com um período já escolhido, fechadas sobre o período base.
 *
 * A data de referência do seletor é o "agora": quando o período base ainda está em curso (termina
 * hoje, mas o dia não acabou), a comparação para no mesmo instante do outro período. Sem isso, às
 * 16h o dia de hoje pela metade era comparado com o dia inteiro do mês anterior.
 */
export function buildComparisonPeriodPresets(base: { after: Date; before: Date }): readonly TComparisonPeriodPreset[] {
	function effectiveEnd(referenceDate: Date) {
		return referenceDate > base.after && referenceDate < base.before ? referenceDate : base.before;
	}
	return [
		{
			id: "previous-period",
			label: "PERÍODO ANTERIOR",
			// Janela imediatamente anterior, de mesma duração: termina 1ms antes do início do período base.
			getValue: (ref) => {
				const durationMs = effectiveEnd(ref).getTime() - base.after.getTime();
				return { from: new Date(base.after.getTime() - 1 - durationMs), to: new Date(base.after.getTime() - 1) };
			},
		},
		{
			id: "same-period-previous-month",
			label: "MESMO PERÍODO DO MÊS ANTERIOR",
			getValue: (ref) => ({ from: dayjs(base.after).subtract(1, "month").toDate(), to: dayjs(effectiveEnd(ref)).subtract(1, "month").toDate() }),
		},
		{
			id: "same-period-previous-year",
			label: "MESMO PERÍODO DO ANO ANTERIOR",
			getValue: (ref) => ({ from: dayjs(base.after).subtract(1, "year").toDate(), to: dayjs(effectiveEnd(ref)).subtract(1, "year").toDate() }),
		},
	];
}

/**
 * O que o usuário escolheu comparar. Um atalho guarda a regra, não as datas: trocar o período base
 * recalcula a comparação. Só o recorte personalizado guarda datas.
 */
export type TComparisonSelection =
	| { kind: "preset"; presetId: TComparisonPresetId }
	| { kind: "custom"; after: Date; before: Date }
	| { kind: "none" };

export const DEFAULT_COMPARISON_SELECTION: TComparisonSelection = { kind: "preset", presetId: DEFAULT_COMPARISON_PRESET_ID };

export function resolveComparisonPeriod(
	selection: TComparisonSelection,
	base: { after: Date; before: Date },
	referenceDate: Date,
): { after: Date; before: Date } | null {
	if (selection.kind === "none") return null;
	if (selection.kind === "custom") return { after: selection.after, before: selection.before };
	const presetItem = buildComparisonPeriodPresets(base).find((item) => item.id === selection.presetId);
	if (!presetItem) return null;
	const { from, to } = presetItem.getValue(referenceDate);
	return { after: from, before: to };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dias de um período, contando o dia em curso como um dia. Feito em milissegundos, e não por
 * `startOf("day")`, porque o servidor roda em UTC: 01/11 00:00 às 17/11 23:59 de Brasília cruza
 * 18 dias em UTC. E `dayjs.diff(..., "days")` trunca, então 17 dias inteiros viravam 16.
 */
export function countPeriodDays(period: { after: Date; before: Date }) {
	return Math.max(1, Math.ceil((period.before.getTime() - period.after.getTime()) / DAY_MS));
}

/** O atalho cujo recorte coincide (por dia) com o valor dado, para nomear o período na tela. */
export function matchPeriodPreset(presets: readonly TPeriodPreset[], value: { after: Date; before: Date }, referenceDate = new Date()) {
	return (
		presets.find((item) => {
			const candidate = item.getValue(referenceDate);
			return dayjs(candidate.from).isSame(value.after, "day") && dayjs(candidate.to).isSame(value.before, "day");
		}) ?? null
	);
}

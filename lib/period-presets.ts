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

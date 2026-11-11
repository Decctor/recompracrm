import dayjs from "dayjs";

/**
 * Períodos das estatísticas de campanha: os atalhos do seletor e o período com que cada recorte é
 * comparado ("no mês anterior", a linha tracejada do gráfico, a variação do ranking).
 *
 * Hora local do navegador, como o resto dos seletores do painel.
 */

export type TStatsPeriod = { startDate: Date; endDate: Date };

export type TCampaignStatsPeriodPresetId = "this-month" | "last-30-days" | "this-quarter";

export const CAMPAIGN_STATS_PERIOD_PRESETS: readonly {
	id: TCampaignStatsPeriodPresetId;
	label: string;
	getValue: (reference: Date) => TStatsPeriod;
}[] = [
	{
		id: "this-month",
		label: "ESTE MÊS",
		// O mês inteiro, não "até hoje": o gráfico mostra o mês com o resto ainda por vir, e a
		// comparação com o mês anterior fica mês contra mês.
		getValue: (reference) => ({ startDate: dayjs(reference).startOf("month").toDate(), endDate: dayjs(reference).endOf("month").toDate() }),
	},
	{
		id: "last-30-days",
		label: "ÚLTIMOS 30 DIAS",
		getValue: (reference) => ({
			startDate: dayjs(reference).subtract(29, "day").startOf("day").toDate(),
			endDate: dayjs(reference).endOf("day").toDate(),
		}),
	},
	{
		id: "this-quarter",
		label: "TRIMESTRE",
		getValue: (reference) => {
			const quarterStart = dayjs(reference)
				.startOf("month")
				.subtract(dayjs(reference).month() % 3, "month");
			return { startDate: quarterStart.toDate(), endDate: quarterStart.add(2, "month").endOf("month").toDate() };
		},
	},
];

export function matchCampaignStatsPeriodPreset(period: TStatsPeriod, reference = new Date()): TCampaignStatsPeriodPresetId | null {
	const match = CAMPAIGN_STATS_PERIOD_PRESETS.find((preset) => {
		const candidate = preset.getValue(reference);
		return dayjs(candidate.startDate).isSame(period.startDate, "day") && dayjs(candidate.endDate).isSame(period.endDate, "day");
	});
	return match?.id ?? null;
}

/**
 * Período de comparação. Um recorte de meses inteiros compara com os mesmos tantos meses
 * imediatamente antes (novembro → outubro inteiro, 1–31). Qualquer outro recorte compara com a
 * janela de mesma duração que termina no dia anterior ao início.
 *
 * Existe porque `endOf("month").subtract(1, "month")` em 30/11 dá 30/10 e deixava o dia 31 de fora.
 */
export function resolveCampaignStatsComparisonPeriod({ startDate, endDate }: TStatsPeriod): TStatsPeriod {
	const start = dayjs(startDate);
	const end = dayjs(endDate);
	const isWholeMonths = start.isSame(start.startOf("month"), "day") && end.isSame(end.endOf("month"), "day");
	if (isWholeMonths) {
		const months = end.startOf("month").diff(start.startOf("month"), "month") + 1;
		const comparingStart = start.subtract(months, "month").startOf("month");
		return { startDate: comparingStart.toDate(), endDate: start.subtract(1, "month").endOf("month").toDate() };
	}
	const days = end.startOf("day").diff(start.startOf("day"), "day") + 1;
	return {
		startDate: start.startOf("day").subtract(days, "day").toDate(),
		endDate: start.subtract(1, "day").endOf("day").toDate(),
	};
}

/** Nome curto do período para legendas: "Novembro" para um mês inteiro, "01/11 – 15/11" no resto. */
export function formatCampaignStatsPeriodLabel({ startDate, endDate }: TStatsPeriod): string {
	const start = dayjs(startDate);
	const end = dayjs(endDate);
	if (start.isSame(start.startOf("month"), "day") && end.isSame(start.endOf("month"), "day")) {
		const month = start.toDate().toLocaleDateString("pt-BR", { month: "long" });
		return month.charAt(0).toUpperCase() + month.slice(1);
	}
	return `${start.format("DD/MM")} – ${end.format("DD/MM")}`;
}

/** Faixa completa para o "Comparado com 01/10 – 31/10/2026". */
export function formatCampaignStatsPeriodRange({ startDate, endDate }: TStatsPeriod): string {
	const start = dayjs(startDate);
	const end = dayjs(endDate);
	return `${start.format(start.year() === end.year() ? "DD/MM" : "DD/MM/YYYY")} – ${end.format("DD/MM/YYYY")}`;
}

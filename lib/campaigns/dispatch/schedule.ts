import { getPostponedDateFromReferenceDate } from "@/lib/dates";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { INTERACTIONS_CRON_TIMEZONE, getArrivedTimeBlocksForDate, getCurrentTimeBlock, type TInteractionCronTimeBlock } from "../time-blocks";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Regras puras de agenda do pipeline de campanhas: quando uma campanha agendada/recorrente está
 * "devida", qual é a chave da janela que identifica a rodada, e para quando um disparo de evento
 * com atraso deve ser marcado. Sem banco, sem relógio implícito — `now` entra sempre por parâmetro.
 */

export type TScheduledWindow = {
	// 'YYYY-MM-DD' no fuso do cron.
	dateKey: string;
	block: TInteractionCronTimeBlock;
};

// Chave de janela de disparos agendados/recorrentes ('2026-09-17@14:00'). É a metade da chave
// única (campanha, janela) que faz do INSERT do disparo um claim idempotente.
export function buildScheduledWindowReference({ dateKey, block }: TScheduledWindow) {
	return `${dateKey}@${block}`;
}

export function resolveScheduledWindowsForNow(now: Date): {
	dateKey: string;
	currentBlock: TInteractionCronTimeBlock;
	arrivedBlocks: TInteractionCronTimeBlock[];
} {
	const nowInCronTimezone = dayjs(now).tz(INTERACTIONS_CRON_TIMEZONE);
	const currentBlock = getCurrentTimeBlock(nowInCronTimezone);
	return {
		dateKey: nowInCronTimezone.format("YYYY-MM-DD"),
		currentBlock,
		// Blocos já vencidos hoje: uma hora perdida pelo relógio é recuperada no tick seguinte, em
		// vez de perder a campanha (motivo de existir o antigo recover-single-use-campaign.ts).
		arrivedBlocks: getArrivedTimeBlocksForDate(currentBlock),
	};
}

// Instante (UTC) correspondente a um bloco de um dia no fuso do cron.
export function resolveDateForWindow({ dateKey, block }: TScheduledWindow): Date {
	return dayjs.tz(`${dateKey} ${block}`, "YYYY-MM-DD HH:mm", INTERACTIONS_CRON_TIMEZONE).toDate();
}

export type TRecurrentScheduleConfig = {
	recorrenciaTipo: string | null;
	recorrenciaIntervalo: number | null;
	recorrenciaDiasSemana: string | null;
	recorrenciaDiasMes: string | null;
	dataInsercao: Date;
};

function parseDayList(value: string | null): number[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number") : [];
	} catch {
		return [];
	}
}

// Uma campanha recorrente roda hoje se a data cai na cadência configurada (a cada N dias/semanas/
// meses a partir da criação) e, para semanal/mensal, se hoje está na lista de dias.
export function shouldRecurrentCampaignRunOnDate(campaign: TRecurrentScheduleConfig, date: Date): boolean {
	const today = dayjs(date).tz(INTERACTIONS_CRON_TIMEZONE);
	const campaignStart = dayjs(campaign.dataInsercao).tz(INTERACTIONS_CRON_TIMEZONE);
	const interval = campaign.recorrenciaIntervalo && campaign.recorrenciaIntervalo > 0 ? campaign.recorrenciaIntervalo : 1;

	switch (campaign.recorrenciaTipo) {
		case "DIARIO": {
			const daysDiff = today.startOf("day").diff(campaignStart.startOf("day"), "day");
			return daysDiff >= 0 && daysDiff % interval === 0;
		}
		case "SEMANAL": {
			if (!parseDayList(campaign.recorrenciaDiasSemana).includes(today.day())) return false;
			const weeksDiff = today.startOf("week").diff(campaignStart.startOf("week"), "week");
			return weeksDiff >= 0 && weeksDiff % interval === 0;
		}
		case "MENSAL": {
			if (!parseDayList(campaign.recorrenciaDiasMes).includes(today.date())) return false;
			const monthsDiff = today.startOf("month").diff(campaignStart.startOf("month"), "month");
			return monthsDiff >= 0 && monthsDiff % interval === 0;
		}
		default:
			return false;
	}
}

export type TEventScheduleConfig = {
	execucaoAgendadaMedida: TTimeDurationUnitsEnum;
	execucaoAgendadaValor: number;
	execucaoAgendadaBloco: TInteractionCronTimeBlock | string;
};

/**
 * Para quando um disparo de evento deve ser marcado. `null` = imediato (sem atraso configurado).
 * Com atraso, a data é `now + atraso` no bloco horário da campanha, no fuso do cron — a mesma
 * conta do antigo `agendamentoDataReferencia` + `agendamentoBlocoReferencia`.
 */
export function resolveEventDispatchScheduledAt({ campaign, now }: { campaign: TEventScheduleConfig; now: Date }): Date | null {
	if (!campaign.execucaoAgendadaValor || campaign.execucaoAgendadaValor <= 0) return null;

	const postponed = getPostponedDateFromReferenceDate({ date: now, unit: campaign.execucaoAgendadaMedida, value: campaign.execucaoAgendadaValor });
	const dateKey = dayjs(postponed).tz(INTERACTIONS_CRON_TIMEZONE).format("YYYY-MM-DD");
	return resolveDateForWindow({ dateKey, block: campaign.execucaoAgendadaBloco as TInteractionCronTimeBlock });
}

// Disparo agendado para um dia específico (aniversário, pior dia) no bloco da campanha.
export function resolveDispatchScheduledAtForDate({ date, block }: { date: Date; block: TInteractionCronTimeBlock | string }): Date {
	const dateKey = dayjs(date).tz(INTERACTIONS_CRON_TIMEZONE).format("YYYY-MM-DD");
	return resolveDateForWindow({ dateKey, block: block as TInteractionCronTimeBlock });
}

export function isDispatchDue({ scheduledAt, now }: { scheduledAt: Date | null; now: Date }) {
	return scheduledAt == null || scheduledAt.getTime() <= now.getTime();
}

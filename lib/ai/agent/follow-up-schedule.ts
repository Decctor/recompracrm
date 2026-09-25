import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import type { TAiAgentCapabilities } from "@/schemas/ai-agents";

/**
 * Guarda programática do agendamento de uma retomada. Pura: recebe o pedido do agente, a
 * configuração da organização e o estado do canal, e devolve **quando** a retomada pode sair —
 * ou por que não pode.
 *
 * A decisão de retomar é do agente; aqui só se aplica o que ele não tem como saber:
 * - teto de horas da organização;
 * - horário comercial (São Paulo), adiando para a próxima abertura;
 * - janela de 24h da Cloud API: sem template, a retomada só sai dentro da janela, então o
 *   horário é **antecipado** para `expiração − margem` quando cairia depois. Melhor um lembrete
 *   18h depois do que nenhum.
 */

export type TFollowUpSettings = TAiAgentCapabilities["retomadas"];

export type TFollowUpScheduleInput = {
	now: Date;
	aguardarHoras: number;
	settings: TFollowUpSettings;
	canal: { tipoConexao: "META_CLOUD_API" | "INTERNAL_GATEWAY" | null | undefined; janelaExpiracao: Date | null | undefined };
};

export type TFollowUpScheduleResult =
	| { agendavel: true; agendadaPara: Date; solicitadaPara: Date; antecipadaPelaJanela: boolean }
	| { agendavel: false; motivo: "JANELA_FECHADA" };

/** Margem de segurança antes de a janela de 24h fechar: a run leva dezenas de segundos e o cron roda a cada 5 min. */
const WINDOW_SAFETY_MARGIN_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type TLocalParts = { year: number; month: number; day: number; hour: number; minute: number; offsetMinutes: number };

function localParts(date: Date): TLocalParts {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: OPERATION_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZoneName: "longOffset",
	});
	const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	// "GMT-03:00" → -180. Sem horário de verão desde 2019, mas o cálculo não depende disso.
	const offsetMatch = /GMT([+-])(\d{2}):(\d{2})/.exec(parts.timeZoneName ?? "GMT-03:00");
	const offsetMinutes = offsetMatch ? (offsetMatch[1] === "-" ? -1 : 1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3])) : -180;
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		offsetMinutes,
	};
}

/** Instante UTC de um horário local (São Paulo) num dia local. */
function fromLocal(parts: Pick<TLocalParts, "year" | "month" | "day" | "offsetMinutes">, hour: number, minute: number, dayOffset = 0): Date {
	return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, hour, minute) - parts.offsetMinutes * 60_000);
}

function parseClock(value: string): { hour: number; minute: number } {
	const [hour, minute] = value.split(":").map(Number);
	return { hour: Number.isFinite(hour) ? hour : 0, minute: Number.isFinite(minute) ? minute : 0 };
}

/**
 * Adia `date` para a próxima abertura do horário comercial quando cai fora dele. Nunca antecipa:
 * dentro do horário devolve a própria data.
 */
export function clampToBusinessHours(date: Date, settings: Pick<TFollowUpSettings, "horarioInicio" | "horarioFim">): Date {
	const inicio = parseClock(settings.horarioInicio);
	const fim = parseClock(settings.horarioFim);
	const inicioMinutes = inicio.hour * 60 + inicio.minute;
	const fimMinutes = fim.hour * 60 + fim.minute;
	// Faixa degenerada (fim <= início): sem restrição, melhor do que adiar para sempre.
	if (fimMinutes <= inicioMinutes) return date;

	const parts = localParts(date);
	const minutes = parts.hour * 60 + parts.minute;
	if (minutes < inicioMinutes) return fromLocal(parts, inicio.hour, inicio.minute);
	if (minutes >= fimMinutes) return fromLocal(parts, inicio.hour, inicio.minute, 1);
	return date;
}

export function resolveFollowUpSchedule(input: TFollowUpScheduleInput): TFollowUpScheduleResult {
	const { now, settings, canal } = input;
	const horas = Math.max(1, Math.min(input.aguardarHoras, settings.maxAguardarHoras));
	const solicitadaPara = new Date(now.getTime() + horas * HOUR_MS);
	let agendadaPara = clampToBusinessHours(solicitadaPara, settings);
	let antecipadaPelaJanela = false;

	if (canal.tipoConexao === "META_CLOUD_API") {
		if (!canal.janelaExpiracao) return { agendavel: false, motivo: "JANELA_FECHADA" };
		const limite = new Date(new Date(canal.janelaExpiracao).getTime() - WINDOW_SAFETY_MARGIN_MS);
		if (limite.getTime() <= now.getTime()) return { agendavel: false, motivo: "JANELA_FECHADA" };
		if (agendadaPara.getTime() > limite.getTime()) {
			// Dentro da janela, mas ainda respeitando o horário se der: se a abertura seguinte cair
			// depois do limite, a retomada sai no limite mesmo (é a última chance antes do template).
			const dentroDoHorario = clampToBusinessHours(limite, settings);
			agendadaPara = dentroDoHorario.getTime() <= limite.getTime() ? dentroDoHorario : limite;
			antecipadaPelaJanela = true;
		}
	}

	return { agendavel: true, agendadaPara, solicitadaPara, antecipadaPelaJanela };
}

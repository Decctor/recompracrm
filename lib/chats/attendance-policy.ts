/**
 * Regras puras de tempo do atendimento: quando uma conversa que volta é um atendimento novo
 * (`capacidades.atendimento.inatividadeHoras`) e quando o agente cobre um responsável humano que
 * não respondeu (`capacidades.atendimento.esperaResponsavelMs`).
 *
 * Puras de propósito: as duas decidem sobre colunas que `chat_assignments` já tem, e quem as chama
 * (a ingestão da mensagem e o cron de cobertura) só lê e grava. Testadas em `attendance-policy.test.ts`.
 */

const HOUR_MS = 60 * 60 * 1000;

/**
 * Motivo gravado em `transferencia_motivo` quando o agente assume uma conversa porque o responsável
 * não respondeu. Constante de dados, por isso em português e SCREAMING_CASE.
 */
export const UNANSWERED_ATTENDANCE_TAKEOVER_REASON = "RESPONSAVEL_SEM_RESPOSTA";

/** Prefixo que `transferChatToHuman` grava no motivo: é como se reconhece um handoff feito pela IA. */
const AI_HANDOFF_REASON_PREFIX = "HUMAN_HANDOFF:";

/**
 * Teto de idade da mensagem pendente para a cobertura. Sem ele, ligar a opção numa organização com
 * conversas antigas sem resposta faria o agente responder, de uma vez, mensagens de dias atrás.
 */
export const UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS = 12 * HOUR_MS;

type TAttendanceActivity = {
	dataAtribuicao: Date;
	dataUltimaEntradaCliente: Date | null;
	dataUltimaResposta: Date | null;
};

/** O último fato do atendimento: mensagem do cliente, resposta ou troca de responsável. */
export function resolveAttendanceLastActivity(attendance: TAttendanceActivity): Date {
	const candidates = [attendance.dataAtribuicao, attendance.dataUltimaEntradaCliente, attendance.dataUltimaResposta].filter(
		(date): date is Date => date instanceof Date,
	);
	return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

/**
 * A mensagem que acabou de chegar abre um atendimento novo? Sim quando o atendimento atual ficou
 * parado por mais de `inatividadeHoras`. `null` desliga a regra: só o cron de 36h encerra.
 */
export function isAttendanceInactive({
	attendance,
	messageDate,
	inatividadeHoras,
}: {
	attendance: TAttendanceActivity;
	messageDate: Date;
	inatividadeHoras: number | null | undefined;
}): boolean {
	if (!inatividadeHoras || inatividadeHoras <= 0) return false;
	const idleMs = messageDate.getTime() - resolveAttendanceLastActivity(attendance).getTime();
	return idleMs > inatividadeHoras * HOUR_MS;
}

export type TUnansweredCoverageAttendance = TAttendanceActivity & {
	responsavelTipo: string;
	transferenciaMotivo: string | null;
};

export type TUnansweredCoverageDecision =
	| { cover: true }
	| { cover: false; reason: "NOT_HUMAN_OWNED" | "NOT_PENDING" | "WITHIN_WAIT" | "TOO_OLD" | "AI_HANDOFF_NOT_PICKED_UP" };

/**
 * O agente deve assumir esta conversa porque o responsável humano não respondeu?
 *
 * A espera conta a partir do que for mais recente entre a mensagem do cliente e a atribuição: quem
 * acabou de receber a conversa tem a espera inteira, mesmo que o cliente esteja esperando há mais.
 *
 * A trava que importa é a do handoff da própria IA. Se ela transferiu e ninguém da equipe falou
 * desde então, reassumir seria devolver o cliente a quem já disse que não resolve, e o agente
 * provavelmente transferiria de novo. Depois que alguém da equipe respondeu, a conversa passou a
 * ser dele, e uma ausência posterior é coberta como qualquer outra.
 */
export function decideUnansweredAttendanceCoverage({
	attendance,
	esperaResponsavelMs,
	humanRepliedSinceAssignment,
	now,
}: {
	attendance: TUnansweredCoverageAttendance;
	esperaResponsavelMs: number;
	humanRepliedSinceAssignment: boolean;
	now: Date;
}): TUnansweredCoverageDecision {
	if (attendance.responsavelTipo !== "USUARIO" && attendance.responsavelTipo !== "EXTERNO") return { cover: false, reason: "NOT_HUMAN_OWNED" };

	const pendingSince = attendance.dataUltimaEntradaCliente;
	if (!pendingSince) return { cover: false, reason: "NOT_PENDING" };
	if (attendance.dataUltimaResposta && attendance.dataUltimaResposta >= pendingSince) return { cover: false, reason: "NOT_PENDING" };

	if (now.getTime() - pendingSince.getTime() > UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS) return { cover: false, reason: "TOO_OLD" };

	const waitingSince = Math.max(pendingSince.getTime(), attendance.dataAtribuicao.getTime());
	if (now.getTime() - waitingSince < esperaResponsavelMs) return { cover: false, reason: "WITHIN_WAIT" };

	if (isAiHandoffReason(attendance.transferenciaMotivo) && !humanRepliedSinceAssignment) {
		return { cover: false, reason: "AI_HANDOFF_NOT_PICKED_UP" };
	}

	return { cover: true };
}

/** O motivo indica um handoff da IA: só então a cobertura precisa saber se a equipe já falou. */
export function isAiHandoffReason(transferenciaMotivo: string | null | undefined): boolean {
	return !!transferenciaMotivo?.startsWith(AI_HANDOFF_REASON_PREFIX);
}

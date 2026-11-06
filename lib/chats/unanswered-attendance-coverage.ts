import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { resolveAiAssignmentAvailability } from "@/lib/chats/ai-assignment";
import { findLatestClientMessage } from "@/lib/chats/ai-trigger";
import { dispatchAiTurn } from "@/lib/chats/ai-turn-dispatch";
import { UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS, decideUnansweredAttendanceCoverage, isAiHandoffReason } from "@/lib/chats/attendance-policy";
import { claimUnansweredAttendanceForAgent } from "@/lib/chats/attendance-state";
import { AiAgentCapabilitiesSchema } from "@/schemas/ai-agents";
import type { DB } from "@/services/drizzle";
import { aiAgents, chatAssignments, chatMessages, organizations } from "@/services/drizzle/schema";
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";

/**
 * Cobertura do responsável ausente: o atendente assumiu a conversa (no hub ou pelo celular), o
 * cliente mandou mensagem e ninguém respondeu dentro de `capacidades.atendimento.esperaResponsavelMs`.
 * O agente assume e responde.
 *
 * Varredura por cron, não um turno agendado na chegada da mensagem: no transporte inline o turno
 * espera dormindo dentro da função do webhook, e uma espera de 15 minutos não cabe nela. O cron
 * funciona nos dois transportes e a decisão é sobre colunas que `chat_assignments` já mantém.
 *
 * A decisão final é de `decideUnansweredAttendanceCoverage` (pura, testada); a consulta só
 * pré-filtra. A posse muda por compare-and-set (`claimUnansweredAttendanceForAgent`), então um
 * atendente que responde entre a leitura e o UPDATE vence. O turno em si é o mesmo do webhook
 * (`runAiTurnForMessage`), ancorado na última mensagem do cliente, com todas as reconfirmações.
 */

const LOG = "[UNANSWERED_COVERAGE]";
const MAX_PER_SWEEP = 25;
/** Mesmos tetos do cron de retomadas: turnos de LLM na própria função vs. publicações na fila. */
const INLINE_RUN_CONCURRENCY = 3;
const QUEUE_PUBLISH_CONCURRENCY = 5;

const CLOSED_ATTENDANCE_STATUSES = ["ENCERRADO", "CANCELADO"] as const;

type TCandidate = {
	agentId: string;
	configuracao: (typeof organizations.$inferSelect)["configuracao"];
	esperaResponsavelMs: number;
	attendance: Pick<
		typeof chatAssignments.$inferSelect,
		| "id"
		| "organizacaoId"
		| "chatId"
		| "responsavelTipo"
		| "responsavelUsuarioId"
		| "transferenciaMotivo"
		| "dataAtribuicao"
		| "dataUltimaEntradaCliente"
		| "dataUltimaResposta"
	>;
};

/** Agentes ativos com a cobertura ligada. Um por organização, então a lista é curta. */
async function loadCoveringAgents(db: DB) {
	const rows = await db
		.select({ id: aiAgents.id, organizacaoId: aiAgents.organizacaoId, capacidades: aiAgents.capacidades, configuracao: organizations.configuracao })
		.from(aiAgents)
		.innerJoin(organizations, eq(organizations.id, aiAgents.organizacaoId))
		.where(and(eq(aiAgents.status, "ATIVO"), sql`(${aiAgents.capacidades} -> 'atendimento' ->> 'esperaResponsavelMs') is not null`));

	return rows.flatMap((row) => {
		const esperaResponsavelMs = parseJsonbWithFallback(AiAgentCapabilitiesSchema, row.capacidades).atendimento.esperaResponsavelMs;
		return esperaResponsavelMs ? [{ ...row, esperaResponsavelMs }] : [];
	});
}

async function loadCandidates(db: DB, now: Date): Promise<TCandidate[]> {
	const agents = await loadCoveringAgents(db);
	const candidates: TCandidate[] = [];

	for (const agent of agents) {
		if (candidates.length >= MAX_PER_SWEEP) break;
		const waitCutoff = new Date(now.getTime() - agent.esperaResponsavelMs);
		const ageCutoff = new Date(now.getTime() - UNANSWERED_COVERAGE_MAX_PENDING_AGE_MS);

		const rows = await db
			.select({
				id: chatAssignments.id,
				organizacaoId: chatAssignments.organizacaoId,
				chatId: chatAssignments.chatId,
				responsavelTipo: chatAssignments.responsavelTipo,
				responsavelUsuarioId: chatAssignments.responsavelUsuarioId,
				transferenciaMotivo: chatAssignments.transferenciaMotivo,
				dataAtribuicao: chatAssignments.dataAtribuicao,
				dataUltimaEntradaCliente: chatAssignments.dataUltimaEntradaCliente,
				dataUltimaResposta: chatAssignments.dataUltimaResposta,
			})
			.from(chatAssignments)
			.where(
				and(
					eq(chatAssignments.organizacaoId, agent.organizacaoId),
					notInArray(chatAssignments.status, [...CLOSED_ATTENDANCE_STATUSES]),
					inArray(chatAssignments.responsavelTipo, ["USUARIO", "EXTERNO"]),
					isNotNull(chatAssignments.dataUltimaEntradaCliente),
					sql`(${chatAssignments.dataUltimaResposta} is null or ${chatAssignments.dataUltimaResposta} < ${chatAssignments.dataUltimaEntradaCliente})`,
					lte(chatAssignments.dataUltimaEntradaCliente, waitCutoff),
					gt(chatAssignments.dataUltimaEntradaCliente, ageCutoff),
					lte(chatAssignments.dataAtribuicao, waitCutoff),
				),
			)
			.orderBy(asc(chatAssignments.dataUltimaEntradaCliente))
			.limit(MAX_PER_SWEEP - candidates.length);

		for (const attendance of rows) {
			candidates.push({ agentId: agent.id, configuracao: agent.configuracao, esperaResponsavelMs: agent.esperaResponsavelMs, attendance });
		}
	}

	return candidates;
}

/** Alguém da equipe escreveu ao cliente desde que a conversa chegou ao responsável atual? */
async function hasHumanRepliedSince(db: DB, input: { chatId: string; since: Date }) {
	const [row] = await db
		.select({ id: chatMessages.id })
		.from(chatMessages)
		.where(
			and(
				eq(chatMessages.chatId, input.chatId),
				inArray(chatMessages.autorTipo, ["USUÁRIO", "BUSINESS-APP"]),
				gte(chatMessages.dataEnvio, input.since),
				ne(chatMessages.statusEntrega, "FALHA"),
			),
		)
		.limit(1);
	return !!row;
}

type TCoverageOutcome = "COBERTO" | "IGNORADO" | "INDISPONIVEL" | "CORRIDA" | "FALHA";

async function coverAttendance(db: DB, candidate: TCandidate, now: Date): Promise<TCoverageOutcome> {
	const { attendance } = candidate;
	const pendingSince = attendance.dataUltimaEntradaCliente;
	if (!pendingSince) return "IGNORADO";

	try {
		// A consulta à conversa só é necessária para o handoff da própria IA (ver a trava na política).
		const humanRepliedSinceAssignment = isAiHandoffReason(attendance.transferenciaMotivo)
			? await hasHumanRepliedSince(db, { chatId: attendance.chatId, since: attendance.dataAtribuicao })
			: true;

		const decision = decideUnansweredAttendanceCoverage({
			attendance,
			esperaResponsavelMs: candidate.esperaResponsavelMs,
			humanRepliedSinceAssignment,
			now,
		});
		if (!decision.cover) return "IGNORADO";

		// Mesma cadeia de gates do hub e do webhook (plano, créditos, número com IA, limite diário,
		// número da equipe, escopo): tirar a conversa do atendente para um agente que o runtime vai
		// recusar deixaria o cliente sem ninguém.
		const availability = await resolveAiAssignmentAvailability(db, {
			organizacaoId: attendance.organizacaoId,
			chatId: attendance.chatId,
			configuracao: candidate.configuracao,
		});
		if (!availability.disponivel) {
			console.log(`${LOG} Agente indisponível para o chat ${attendance.chatId}: ${availability.motivo}`);
			return "INDISPONIVEL";
		}

		const latestClientMessage = await findLatestClientMessage({ chatId: attendance.chatId });
		if (!latestClientMessage) return "IGNORADO";

		const claimed = await claimUnansweredAttendanceForAgent(db, {
			organizacaoId: attendance.organizacaoId,
			attendanceId: attendance.id,
			agenteId: candidate.agentId,
			observed: {
				responsavelTipo: attendance.responsavelTipo,
				responsavelUsuarioId: attendance.responsavelUsuarioId,
				dataUltimaEntradaCliente: pendingSince,
			},
			now,
		});
		// O atendente respondeu (ou alguém assumiu) entre a leitura e o UPDATE: ele vence.
		if (!claimed) return "CORRIDA";

		console.log(`${LOG} Agente assumiu o chat ${attendance.chatId} (responsável ${attendance.responsavelTipo} sem resposta).`);

		// Sem espera: a espera foi a do responsável. O runner reconfirma posse e pendência antes de gastar tokens.
		await dispatchAiTurn(
			{
				organizationId: attendance.organizacaoId,
				chatId: attendance.chatId,
				triggerMessageId: latestClientMessage.id,
				triggerMessageSentAt: pendingSince.toISOString(),
			},
			{ delayMs: 0 },
		);
		return "COBERTO";
	} catch (error) {
		console.error(`${LOG} Falha ao cobrir o atendimento ${attendance.id}:`, error);
		return "FALHA";
	}
}

export async function coverUnansweredAttendances(db: DB, { now = new Date() }: { now?: Date } = {}) {
	const candidates = await loadCandidates(db, now);
	const useQueue = process.env.AI_TURN_TRANSPORT === "queue";

	const outcomes = await mapWithConcurrency(candidates, useQueue ? QUEUE_PUBLISH_CONCURRENCY : INLINE_RUN_CONCURRENCY, (candidate) =>
		coverAttendance(db, candidate, now),
	);

	const summary = outcomes.reduce<Record<TCoverageOutcome, number>>(
		(acc, outcome) => {
			acc[outcome] += 1;
			return acc;
		},
		{ COBERTO: 0, IGNORADO: 0, INDISPONIVEL: 0, CORRIDA: 0, FALHA: 0 },
	);

	if (candidates.length > 0) console.log(`${LOG} ${candidates.length} candidato(s):`, summary);
	return { candidatos: candidates.length, ...summary };
}

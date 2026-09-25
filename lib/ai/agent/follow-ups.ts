import { naiveUtcParam } from "@/lib/chats/analytics";
import { changeChatAttendanceStatus, getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { AI_AGENT_FOLLOW_UP_CANCEL_REASONS, type TAiAgentCapabilities, type TAiAgentTurnFollowUp } from "@/schemas/ai-agents";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgentFollowUps, chats } from "@/services/drizzle/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { cancelScheduledFollowUp } from "./follow-up-cancel";
import { resolveFollowUpSchedule } from "./follow-up-schedule";

type TDb = DB | DBTransaction;

/**
 * Retomadas de conversa: agendamento a partir da saída do turno e reivindicação pelo executor.
 *
 * A decisão de retomar é do agente (`retomada` em `TurnOutputSchema`), tomada com todo o contexto
 * na mão e sem nenhuma chamada extra. Aqui só entram as guardas que ele não tem como aplicar —
 * configuração da organização, janela de 24h, limite por atendimento — e a mecânica de fila.
 */

export type TScheduleFollowUpResult = { agendada: true; id: string; para: Date; antecipadaPelaJanela: boolean } | { agendada: false; motivo: string };

export async function scheduleFollowUpFromTurn(
	db: TDb,
	input: {
		organizacaoId: string;
		chatId: string;
		agenteId: string;
		runId: string;
		retomada: TAiAgentTurnFollowUp;
		capacidades: TAiAgentCapabilities;
		now?: Date;
	},
): Promise<TScheduleFollowUpResult> {
	const now = input.now ?? new Date();
	const settings = input.capacidades.retomadas;
	if (!settings.habilitadas) return { agendada: false, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.DESABILITADAS };

	// A retomada pertence ao episódio: sem atendimento ativo do agente não há o que retomar.
	const atendimento = await getCurrentChatAttendance(db, { organizacaoId: input.organizacaoId, chatId: input.chatId });
	if (!atendimento || atendimento.responsavelTipo !== "AGENTE") return { agendada: false, motivo: "ATENDIMENTO_NAO_E_DO_AGENTE" };

	// Limite por episódio: conta o que foi de fato consumido — executada, expirada na janela ou
	// cancelada por um humano. Uma retomada que o cliente atropelou (respondeu antes) não gastou
	// nada, e a substituída é a mesma intenção refeita pelo turno seguinte.
	const [row] = await db
		.select({ total: count() })
		.from(aiAgentFollowUps)
		.where(
			and(
				eq(aiAgentFollowUps.atendimentoId, atendimento.id),
				sql`(${aiAgentFollowUps.status} in ('EXECUTADA', 'EXPIRADA') or (${aiAgentFollowUps.status} = 'CANCELADA' and ${aiAgentFollowUps.motivoCancelamento} = ${AI_AGENT_FOLLOW_UP_CANCEL_REASONS.CANCELADA_PELO_HUB}))`,
			),
		);
	if (Number(row?.total ?? 0) >= settings.maxPorAtendimento) return { agendada: false, motivo: "LIMITE_ATENDIMENTO" };

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, input.organizacaoId)),
		columns: { whatsappJanelaDataExpiracao: true },
		with: { whatsappConexao: { columns: { tipoConexao: true } }, cliente: { columns: { comunicacaoPausadaAte: true } } },
	});
	if (!chat) return { agendada: false, motivo: "CHAT_NAO_ENCONTRADO" };
	if (chat.cliente?.comunicacaoPausadaAte && chat.cliente.comunicacaoPausadaAte > now) {
		return { agendada: false, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.COMUNICACAO_PAUSADA };
	}

	const schedule = resolveFollowUpSchedule({
		now,
		aguardarHoras: input.retomada.aguardarHoras,
		settings,
		canal: { tipoConexao: chat.whatsappConexao?.tipoConexao, janelaExpiracao: chat.whatsappJanelaDataExpiracao },
	});
	if (!schedule.agendavel) return { agendada: false, motivo: schedule.motivo };

	// O turno mais novo sabe mais: substitui a agendada anterior do mesmo chat, se houver.
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.SUBSTITUIDA });
	const [inserted] = await db
		.insert(aiAgentFollowUps)
		.values({
			organizacaoId: input.organizacaoId,
			agenteId: input.agenteId,
			chatId: input.chatId,
			atendimentoId: atendimento.id,
			runOrigemId: input.runId,
			status: "AGENDADA",
			objetivo: input.retomada.objetivo.trim(),
			agendadaPara: schedule.agendadaPara,
			solicitadaPara: schedule.solicitadaPara,
		})
		.returning({ id: aiAgentFollowUps.id });
	if (!inserted) return { agendada: false, motivo: "FALHA_AO_GRAVAR" };

	// O quadro passa a dizer a verdade: a bola está com o cliente.
	await changeChatAttendanceStatus(db, { organizacaoId: input.organizacaoId, chatId: input.chatId, status: "AGUARDANDO_CLIENTE", now });

	return { agendada: true, id: inserted.id, para: schedule.agendadaPara, antecipadaPelaJanela: schedule.antecipadaPelaJanela };
}

/** Retomada agendada de um chat, para o hub exibir e cancelar. */
export async function getScheduledFollowUp(db: TDb, input: { organizacaoId: string; chatId: string }) {
	return db.query.aiAgentFollowUps.findFirst({
		where: and(
			eq(aiAgentFollowUps.chatId, input.chatId),
			eq(aiAgentFollowUps.organizacaoId, input.organizacaoId),
			eq(aiAgentFollowUps.status, "AGENDADA"),
		),
		columns: { id: true, objetivo: true, agendadaPara: true, solicitadaPara: true, dataInsercao: true },
	});
}

const FOLLOW_UP_LEASE_MS = 5 * 60 * 1000;
const FOLLOW_UP_MAX_ATTEMPTS = 3;

/**
 * Reivindica as retomadas vencidas para execução. Lease de 5 min com `SKIP LOCKED`: dois
 * crons (ou o cron e a fila) nunca pegam a mesma. A tentativa sobe a cada reivindicação; quem
 * chegar à terceira sem concluir é cancelada por `FALHA_EXECUCAO` em vez de tentar para sempre.
 */
export async function claimDueFollowUps(db: TDb, input: { now?: Date; limit?: number } = {}) {
	const now = input.now ?? new Date();
	const limit = input.limit ?? 25;
	const leaseAte = new Date(now.getTime() + FOLLOW_UP_LEASE_MS);

	// Expira as que já estouraram as tentativas antes de reivindicar de novo.
	await db
		.update(aiAgentFollowUps)
		.set({ status: "CANCELADA", motivoCancelamento: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.FALHA_EXECUCAO, leaseAte: null })
		.where(
			and(
				eq(aiAgentFollowUps.status, "AGENDADA"),
				sql`${aiAgentFollowUps.tentativa} >= ${FOLLOW_UP_MAX_ATTEMPTS}`,
				sql`(${aiAgentFollowUps.leaseAte} is null or ${aiAgentFollowUps.leaseAte} < ${naiveUtcParam(now)})`,
			),
		);

	return db
		.update(aiAgentFollowUps)
		.set({ leaseAte, tentativa: sql`${aiAgentFollowUps.tentativa} + 1` })
		.where(
			sql`${aiAgentFollowUps.id} in (
				select ${aiAgentFollowUps.id} from ${aiAgentFollowUps}
				where ${aiAgentFollowUps.status} = 'AGENDADA'
					and ${aiAgentFollowUps.agendadaPara} <= ${naiveUtcParam(now)}
					and (${aiAgentFollowUps.leaseAte} is null or ${aiAgentFollowUps.leaseAte} < ${naiveUtcParam(now)})
				order by ${aiAgentFollowUps.agendadaPara} asc
				limit ${limit}
				for update skip locked
			)`,
		)
		.returning({
			id: aiAgentFollowUps.id,
			organizacaoId: aiAgentFollowUps.organizacaoId,
			chatId: aiAgentFollowUps.chatId,
			tentativa: aiAgentFollowUps.tentativa,
		});
}

export async function markFollowUpExecuted(db: TDb, input: { id: string; runId: string | null; now?: Date }) {
	await db
		.update(aiAgentFollowUps)
		.set({ status: "EXECUTADA", runExecucaoId: input.runId, dataExecucao: input.now ?? new Date(), leaseAte: null })
		.where(and(eq(aiAgentFollowUps.id, input.id), eq(aiAgentFollowUps.status, "AGENDADA")));
}

export async function markFollowUpExpired(db: TDb, input: { id: string; motivo: string }) {
	await db
		.update(aiAgentFollowUps)
		.set({ status: "EXPIRADA", motivoCancelamento: input.motivo, leaseAte: null })
		.where(and(eq(aiAgentFollowUps.id, input.id), eq(aiAgentFollowUps.status, "AGENDADA")));
}

export async function cancelFollowUpById(db: TDb, input: { id: string; organizacaoId: string; motivo: string }) {
	const [cancelled] = await db
		.update(aiAgentFollowUps)
		.set({ status: "CANCELADA", motivoCancelamento: input.motivo, leaseAte: null })
		.where(and(eq(aiAgentFollowUps.id, input.id), eq(aiAgentFollowUps.organizacaoId, input.organizacaoId), eq(aiAgentFollowUps.status, "AGENDADA")))
		.returning({ id: aiAgentFollowUps.id, chatId: aiAgentFollowUps.chatId });
	return cancelled ?? null;
}

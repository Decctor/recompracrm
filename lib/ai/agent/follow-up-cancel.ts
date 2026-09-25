import type { TAiAgentFollowUpCancelReason } from "@/schemas/ai-agents";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgentFollowUps } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

type TDb = DB | DBTransaction;

/**
 * Cancela a retomada AGENDADA de um chat, se houver. Idempotente: um UPDATE filtrado por status.
 *
 * Módulo mínimo de propósito — só importa o schema. É chamado de `attendance-state.ts` (toda
 * troca de posse e todo encerramento), do webhook de mensagem recebida e da pausa de
 * comunicação; se vivesse em `follow-ups.ts`, que importa `attendance-state`, fecharia um ciclo.
 */
export async function cancelScheduledFollowUp(
	db: TDb,
	input: { chatId: string; motivo: TAiAgentFollowUpCancelReason },
): Promise<{ id: string } | null> {
	const [cancelled] = await db
		.update(aiAgentFollowUps)
		.set({ status: "CANCELADA", motivoCancelamento: input.motivo, leaseAte: null })
		.where(and(eq(aiAgentFollowUps.chatId, input.chatId), eq(aiAgentFollowUps.status, "AGENDADA")))
		.returning({ id: aiAgentFollowUps.id });
	return cancelled ?? null;
}

/** Cancela as retomadas AGENDADAS de vários chats de uma vez (encerramento em lote por inatividade). */
export async function cancelScheduledFollowUpsForChats(db: TDb, input: { chatIds: string[]; motivo: TAiAgentFollowUpCancelReason }): Promise<number> {
	if (input.chatIds.length === 0) return 0;
	const cancelled = await db
		.update(aiAgentFollowUps)
		.set({ status: "CANCELADA", motivoCancelamento: input.motivo, leaseAte: null })
		.where(and(inArray(aiAgentFollowUps.chatId, input.chatIds), eq(aiAgentFollowUps.status, "AGENDADA")))
		.returning({ id: aiAgentFollowUps.id });
	return cancelled.length;
}

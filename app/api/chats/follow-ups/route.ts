import { cancelFollowUpById } from "@/lib/ai/agent/follow-ups";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess, mayManageAssignment } from "@/lib/chats/access";
import { getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { AI_AGENT_FOLLOW_UP_CANCEL_REASONS } from "@/schemas/ai-agents";
import { db } from "@/services/drizzle";
import { aiAgentFollowUps } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= DELETE - Cancelar uma retomada agendada =============

const DeleteChatFollowUpInputSchema = z.object({
	id: z.string({ required_error: "ID da retomada não informado.", invalid_type_error: "Tipo inválido para o ID da retomada." }),
});
export type TDeleteChatFollowUpInput = z.infer<typeof DeleteChatFollowUpInputSchema>;

/**
 * Cancela uma retomada agendada pela IA. Mesma regra de posse das demais ações sobre o
 * atendimento: quem detém a conversa ou quem tem gestão (`finalizar`).
 */
async function deleteChatFollowUp({ session, input }: { session: TAuthUserSession; input: TDeleteChatFollowUpInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "responder" });

	const followUp = await db.query.aiAgentFollowUps.findFirst({
		where: and(eq(aiAgentFollowUps.id, input.id), eq(aiAgentFollowUps.organizacaoId, organizacaoId)),
		columns: { id: true, chatId: true, status: true },
	});
	if (!followUp) throw new createHttpError.NotFound("Retomada não encontrada.");
	if (followUp.status !== "AGENDADA") throw new createHttpError.Conflict("Esta retomada já não está agendada.");

	const atendimento = await getCurrentChatAttendance(db, { organizacaoId, chatId: followUp.chatId });
	// Atendimento com a IA não tem dono humano: qualquer um que responde no hub pode cancelar o
	// lembrete dela, como pode assumir a conversa. Com dono humano, vale a posse.
	if (atendimento?.responsavelTipo === "USUARIO" && !mayManageAssignment({ session, assignment: atendimento })) {
		throw new createHttpError.Forbidden("Só o responsável pelo atendimento ou um gestor pode cancelar a retomada.");
	}

	const cancelled = await cancelFollowUpById(db, { id: followUp.id, organizacaoId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.CANCELADA_PELO_HUB });
	if (!cancelled) throw new createHttpError.Conflict("Esta retomada já não está agendada.");

	return { data: { id: cancelled.id, chatId: cancelled.chatId }, message: "Retomada cancelada." };
}
export type TDeleteChatFollowUpOutput = Awaited<ReturnType<typeof deleteChatFollowUp>>;

async function deleteChatFollowUpRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = DeleteChatFollowUpInputSchema.parse({ id: req.nextUrl.searchParams.get("id") });
	const result = await deleteChatFollowUp({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

export const DELETE = appApiHandler({ DELETE: deleteChatFollowUpRoute });

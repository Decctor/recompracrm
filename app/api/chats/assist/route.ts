import { runChatAssist } from "@/lib/ai/agent/assist";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess, mayManageAssignment } from "@/lib/chats/access";
import { getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { db } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= POST - Assistência da IA ao atendente =============

const ChatAssistInputSchema = z
	.object({
		chatId: z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." }),
		acao: z.enum(["SUGERIR_RESPOSTA", "RESUMIR", "REESCREVER"], { invalid_type_error: "Ação de assistência inválida." }),
		texto: z.string({ invalid_type_error: "Tipo inválido para o texto." }).max(4000, "O rascunho não pode ter mais de 4000 caracteres.").optional().nullable(),
		orientacao: z
			.string({ invalid_type_error: "Tipo inválido para a orientação." })
			.max(500, "A orientação não pode ter mais de 500 caracteres.")
			.optional()
			.nullable(),
	})
	.superRefine((input, ctx) => {
		if (input.acao === "REESCREVER" && !input.texto?.trim()) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["texto"], message: "Escreva um rascunho para a IA reescrever." });
		}
	});
export type TChatAssistInput = z.infer<typeof ChatAssistInputSchema>;

/**
 * A IA ajuda quem detém o atendimento: sugere resposta, reescreve o rascunho ou resume a conversa.
 * Nunca envia nada — o texto volta para o compositor. Exige posse do atendimento (ou gestão),
 * como o envio; e o recurso de IA no plano, como qualquer run.
 */
async function assistChat({ session, input }: { session: TAuthUserSession; input: TChatAssistInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "responder" });

	if (!session.membership?.organizacao.configuracao?.recursos?.iaAtendimento?.acesso) {
		throw new createHttpError.Forbidden("O recurso de IA não está disponível no plano da sua organização.");
	}

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true },
	});
	if (!chat) throw new createHttpError.NotFound("Chat não encontrado.");

	const atendimento = await getCurrentChatAttendance(db, { organizacaoId, chatId: input.chatId });
	if (atendimento?.responsavelTipo !== "USUARIO" || !mayManageAssignment({ session, assignment: atendimento })) {
		throw new createHttpError.Forbidden("Assuma este atendimento para pedir ajuda à IA.");
	}

	const agent = await ensureOrganizationAgent(db, organizacaoId);
	if (agent.status !== "ATIVO") throw new createHttpError.Conflict("O agente de IA da organização está pausado.");

	const result = await runChatAssist({
		organizacaoId,
		chatId: input.chatId,
		acao: input.acao,
		atendente: { id: session.user.id, nome: session.user.nome },
		orientacao: input.orientacao,
		texto: input.texto,
	});

	const message =
		input.acao === "RESUMIR"
			? result.resumo
				? "Resumo do atendimento atualizado."
				: "A IA não conseguiu resumir esta conversa."
			: result.sugestao
				? "Sugestão pronta no rascunho — revise antes de enviar."
				: "A IA não tinha o que sugerir para esta conversa.";

	return { data: result, message };
}
export type TChatAssistOutput = Awaited<ReturnType<typeof assistChat>>;

async function assistChatRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = ChatAssistInputSchema.parse(await req.json());
	const result = await assistChat({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: assistChatRoute });

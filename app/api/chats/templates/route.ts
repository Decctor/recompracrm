import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { db } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema/chats";
import { messageTemplates } from "@/services/drizzle/schema/message-templates";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= GET - Templates aprovados para o número de um chat =============

const GetChatTemplatesInputSchema = z.object({
	chatId: z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." }),
});
export type TGetChatTemplatesInput = z.infer<typeof GetChatTemplatesInputSchema>;

/**
 * Templates que o hub pode oferecer para reabrir uma conversa com a janela de 24h expirada.
 *
 * Mesma regra de `resolveApprovedTemplate` (`lib/chats/outgoing-message.ts`): a aprovação da Meta
 * é por número e vive em `metadados.porNumeroTelefone[<telefone>].status`; a coluna `status` é o
 * ciclo de vida interno e só entra aqui para esconder os arquivados.
 *
 * A chave de `porNumeroTelefone` é o **id da linha** de `whatsapp_connection_phones` (é o que a
 * submissão, a sincronização e o construtor de campanhas gravam e leem), isto é,
 * `chats.whatsappConexaoTelefoneId` — e não `chats.whatsappTelefoneId`, o id do número na Meta.
 *
 * O formato de cada item é o que `ChatInputArea` consome em `templates`: `{ id, nome }`.
 */
async function getChatTemplates({ session, input }: { session: TAuthUserSession; input: TGetChatTemplatesInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true, whatsappConexaoTelefoneId: true },
		with: { whatsappConexao: { columns: { tipoConexao: true } } },
	});
	if (!chat) throw new createHttpError.NotFound("Chat não encontrado.");

	// Template e janela de 24h são da Meta Cloud API; o Gateway Interno envia texto livre.
	if (chat.whatsappConexao?.tipoConexao !== "META_CLOUD_API" || !chat.whatsappConexaoTelefoneId) {
		return { data: { templates: [] }, message: "Nenhum template disponível para este chat." };
	}

	const templates = await db
		.select({ id: messageTemplates.id, nome: messageTemplates.nome })
		.from(messageTemplates)
		.where(
			and(
				eq(messageTemplates.organizacaoId, organizacaoId),
				ne(messageTemplates.status, "ARQUIVADO"),
				sql`${messageTemplates.metadados} -> 'porNumeroTelefone' -> ${chat.whatsappConexaoTelefoneId} ->> 'status' = 'APROVADO'`,
			),
		)
		.orderBy(asc(messageTemplates.nome));

	return { data: { templates }, message: "Templates carregados com sucesso." };
}
export type TGetChatTemplatesOutput = Awaited<ReturnType<typeof getChatTemplates>>;

async function getChatTemplatesRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = GetChatTemplatesInputSchema.parse({ chatId: req.nextUrl.searchParams.get("chatId") });
	const result = await getChatTemplates({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatTemplatesRoute });

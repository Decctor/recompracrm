import { getChatMediaUrl } from "@/lib/files-storage/chat-media";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema/chats";
import { and, eq } from "drizzle-orm";

import { buildQuotedMessageSnapshot, buildUnavailableQuotedMessage, type TQuotedMessageSnapshot } from "./quoted-message";

/**
 * Resolve a mensagem citada por um wamid para o snapshot guardado na resposta. Uma consulta
 * pelo mesmo índice que reações e edições usam.
 */
export async function resolveQuotedMessageByWhatsappId(input: { organizacaoId: string; whatsappMessageId: string }): Promise<TQuotedMessageSnapshot> {
	const message = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.organizacaoId, input.organizacaoId), eq(chatMessages.whatsappMessageId, input.whatsappMessageId)),
		columns: {
			id: true,
			autorTipo: true,
			conteudoTexto: true,
			conteudoMidiaTipo: true,
			conteudoMidiaUrl: true,
			conteudoMidiaStorageId: true,
			conteudoMidiaArquivoNome: true,
			whatsappMessageId: true,
		},
		with: { autorUsuario: { columns: { nome: true } } },
	});
	if (!message) {
		console.warn("[CHATS] [QUOTE] Mensagem citada não encontrada na base:", input.whatsappMessageId);
		return buildUnavailableQuotedMessage(input.whatsappMessageId);
	}
	return buildQuotedMessageSnapshot({
		...message,
		// A URL pública é derivada do storage id: URLs salvas em conteudoMidiaUrl envelhecem.
		conteudoMidiaUrl: message.conteudoMidiaStorageId ? getChatMediaUrl(message.conteudoMidiaStorageId) : message.conteudoMidiaUrl,
	});
}

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess } from "@/lib/chats/access";
import { assumeChatAttendanceForUser } from "@/lib/chats/attendance-state";
import { canForwardMessage, FORWARD_MAX_TARGETS, isForwardableMediaType } from "@/lib/chats/forward-message";
import { loadChatForSending, sendOutgoingChatMessage, type TStoredOutgoingMedia } from "@/lib/chats/outgoing-message";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema/chats";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= POST - Encaminhar uma mensagem para outras conversas =============

const ForwardChatMessageInputSchema = z.object({
	sourceMessageId: z.string({
		required_error: "Mensagem a encaminhar não informada.",
		invalid_type_error: "Tipo inválido para o ID da mensagem a encaminhar.",
	}),
	targets: z
		.array(
			z.object({
				chatId: z.string({
					required_error: "ID da conversa de destino não informado.",
					invalid_type_error: "Tipo inválido para o ID da conversa de destino.",
				}),
			}),
			{ required_error: "Conversas de destino não informadas.", invalid_type_error: "Tipo inválido para as conversas de destino." },
		)
		.min(1, "Escolha ao menos uma conversa.")
		.max(FORWARD_MAX_TARGETS, `Encaminhe para até ${FORWARD_MAX_TARGETS} conversas por vez.`),
});
export type TForwardChatMessageInput = z.infer<typeof ForwardChatMessageInputSchema>;

type TForwardResult = {
	chatId: string;
	clienteNome: string | null;
	ok: boolean;
	mensagemId?: string;
	erro?: string;
};

/** Recusa de um destino: vira `erro` no resultado daquele destino, sem derrubar os outros. */
class ForwardTargetError extends Error {}

function describeTargetFailure(error: unknown) {
	if (error instanceof ForwardTargetError) return error.message;
	// Erros HTTP das pré-condições de envio (conexão sem token, gateway desconectado…) têm
	// mensagem pensada para o usuário; falhas do provedor não.
	if (createHttpError.isHttpError(error) && error.expose) return error.message;
	return "Falha no envio pelo WhatsApp.";
}

function summarize(results: TForwardResult[]) {
	const okCount = results.filter((result) => result.ok).length;
	if (okCount === 0) return "Nenhuma mensagem foi encaminhada.";
	if (okCount === results.length) return results.length === 1 ? "Mensagem encaminhada." : "Mensagens encaminhadas.";
	return `${okCount} de ${results.length} mensagens encaminhadas.`;
}

/**
 * Reenvia o conteúdo de uma mensagem do hub para outras conversas da organização.
 *
 * Cada destino passa pelas mesmas pré-condições do envio do composer, com uma diferença: uma
 * conversa **sem dono** é assumida por quem encaminha antes do envio — é o que o botão "Encaminhar
 * e assumir" promete. Conversa com outro responsável (colega, IA ou telefone) é recusada, nunca
 * tomada. A janela de 24h é checada **antes** de assumir, para que um destino recusado não fique
 * com um dono que não pode responder.
 *
 * A mídia é reaproveitada pelo storage id da original: nada é baixado nem re-enviado ao storage.
 * Citação e reações ficam para trás, como no WhatsApp.
 */
async function forwardChatMessage({ session, input }: { session: TAuthUserSession; input: TForwardChatMessageInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "responder" });

	const source = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.id, input.sourceMessageId), eq(chatMessages.organizacaoId, organizacaoId)),
	});
	if (!source) throw new createHttpError.NotFound("Mensagem não encontrada.");

	// Mídia sem storage id (legado com URL externa) não tem de onde ser reenviada sem re-upload.
	const hasStoredMedia = isForwardableMediaType(source.conteudoMidiaTipo) && !!source.conteudoMidiaStorageId;
	const forwardable =
		canForwardMessage({ ...source, metadados: source.metadados ?? null }) && (source.conteudoMidiaTipo === "TEXTO" || hasStoredMedia);
	if (!forwardable) throw new createHttpError.UnprocessableEntity("Esta mensagem não pode ser encaminhada.");

	const midia: TStoredOutgoingMedia | null =
		hasStoredMedia && isForwardableMediaType(source.conteudoMidiaTipo)
			? {
					tipo: source.conteudoMidiaTipo,
					storageId: source.conteudoMidiaStorageId as string,
					mimeType: source.conteudoMidiaMimeType || "application/octet-stream",
					arquivoNome: source.conteudoMidiaArquivoNome,
					url: source.conteudoMidiaUrl,
					tamanho: source.conteudoMidiaArquivoTamanho,
				}
			: null;
	// Áudio não carrega legenda no WhatsApp (mesma regra do envio). Template encaminha o corpo
	// renderizado que ficou gravado: o destino recebe texto livre, não o template.
	const texto = midia?.tipo === "AUDIO" ? "" : (source.conteudoTexto?.trim() ?? "");

	// Destinos repetidos no payload são um destino só.
	const targetChatIds = [...new Set(input.targets.map((target) => target.chatId))];
	const results: TForwardResult[] = [];

	// Sequencial de propósito: o provedor limita a taxa por número, e um erro num destino não
	// pode deixar os outros num estado ambíguo.
	for (const chatId of targetChatIds) {
		let clienteNome: string | null = null;
		try {
			if (chatId === source.chatId) throw new ForwardTargetError("A mensagem já está nesta conversa.");

			const { chat, atendimentoAtivo, janelaAberta } = await loadChatForSending({ organizacaoId, chatId });
			clienteNome = chat.cliente?.nome ?? null;

			const ownedByMe = atendimentoAtivo?.responsavelTipo === "USUARIO" && atendimentoAtivo.responsavelUsuarioId === session.user.id;
			const isFree = !atendimentoAtivo || atendimentoAtivo.responsavelTipo === "NAO_ATRIBUIDO";
			if (!ownedByMe && !isFree) {
				if (atendimentoAtivo?.responsavelTipo === "AGENTE") throw new ForwardTargetError("Em atendimento pela IA.");
				if (atendimentoAtivo?.responsavelTipo === "EXTERNO") throw new ForwardTargetError("Em atendimento pelo telefone.");
				throw new ForwardTargetError("Em atendimento por outro usuário.");
			}

			if (!janelaAberta) throw new ForwardTargetError("Janela de 24h fechada.");

			if (!ownedByMe) {
				// `somenteSeLivre`: assumir toma a conversa de um colega por padrão (decisão de produto),
				// mas encaminhar não é esse gesto — aqui só se assume o que estava livre na leitura.
				const assumed = await assumeChatAttendanceForUser(db, { organizacaoId, chatId, usuarioId: session.user.id, somenteSeLivre: true });
				// null = alguém assumiu entre a leitura e a escrita.
				if (!assumed) throw new ForwardTargetError("Em atendimento por outro usuário.");
			}

			const { messageId } = await sendOutgoingChatMessage({
				organizacaoId,
				chat,
				autorUsuarioId: session.user.id,
				texto,
				midia,
				template: null,
				metadados: {
					whatsappContext: { forwarded: true },
					encaminhadaDe: { mensagemId: source.id, chatId: source.chatId },
				},
			});

			results.push({ chatId, clienteNome, ok: true, mensagemId: messageId });
		} catch (error) {
			if (!(error instanceof ForwardTargetError)) console.error("[ERROR] [CHAT_FORWARD] Falha ao encaminhar para o chat", chatId, error);
			results.push({ chatId, clienteNome, ok: false, erro: describeTargetFailure(error) });
		}
	}

	return { data: { resultados: results }, message: summarize(results) };
}
export type TForwardChatMessageOutput = Awaited<ReturnType<typeof forwardChatMessage>>;

async function forwardChatMessageRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = ForwardChatMessageInputSchema.parse(await req.json());
	const result = await forwardChatMessage({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const POST = appApiHandler({ POST: forwardChatMessageRoute });

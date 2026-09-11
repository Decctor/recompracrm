import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import { getChatMediaUrl } from "@/lib/files-storage/chat-media";
import { buildWhatsappTemplateSendPayload } from "@/lib/message-templates/channels/whatsapp/send-payload";
import { buildWhatsappPlainContent } from "@/lib/message-templates/channels/whatsapp/plain-content";
import { sendBasicWhatsappMessage, sendMediaWhatsappMessage, sendTemplateWhatsappMessage, uploadMediaToWhatsapp } from "@/lib/whatsapp";
import { parseTemplatePayloadToGatewayContent, sendMessage as sendInternalGatewayMessage } from "@/lib/whatsapp/internal-gateway";
import { formatPhoneAsWhatsappId, formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import type { TChatMessageDeliveryStatus, TChatMessageContentTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { SUPABASE_STORAGE_CHAT_MEDIA_BUCKET } from "@/lib/files-storage/chat-media";
import { chatAssignments, chatMessages, chats, messageTemplates } from "@/services/drizzle/schema";
import { supabaseClient } from "@/services/supabase";
import { and, eq, notInArray } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Despacho de mensagens de saída do hub.
 *
 * Concentra o que antes vivia em `POST /api/chats/messages/send-whatsapp`: escolha do
 * provedor (Meta Cloud API vs. Gateway Interno), upload de mídia para o provedor e
 * marcação do status de entrega. A rota chama isto **depois** de persistir a mensagem
 * em PENDENTE, para que uma falha do provedor deixe um registro reprocessável.
 */

const CLOSED_ASSIGNMENT_STATUSES = ["ENCERRADO", "CANCELADO"] as const;

export type TOutgoingMedia = {
	tipo: Exclude<TChatMessageContentTypeEnum, "TEXTO">;
	storageId: string;
	mimeType: string;
	arquivoNome: string | null;
};

export type TApprovedTemplate = Awaited<ReturnType<typeof resolveApprovedTemplate>>;

/** Carrega o chat com tudo que o envio precisa validar, em uma consulta só. */
export async function loadChatForSending({ organizacaoId, chatId }: { organizacaoId: string; chatId: string }) {
	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
		with: {
			cliente: { columns: { id: true, nome: true, telefone: true } },
			whatsappConexao: { columns: { id: true, token: true, tipoConexao: true, gatewaySessaoId: true, gatewayStatus: true } },
		},
	});
	if (!chat) throw new createHttpError.NotFound("Chat não encontrado.");
	if (!chat.whatsappConexao) throw new createHttpError.BadRequest("Conexão WhatsApp não configurada para este chat.");
	if (!chat.cliente?.telefone) throw new createHttpError.BadRequest("Cliente não possui telefone cadastrado.");

	const tipoConexao = chat.whatsappConexao.tipoConexao;
	if (tipoConexao === "META_CLOUD_API") {
		if (!chat.whatsappConexao.token) throw new createHttpError.BadRequest("Token do WhatsApp não configurado.");
		if (!chat.whatsappTelefoneId) throw new createHttpError.BadRequest("Número do WhatsApp não configurado para este chat.");
	}
	if (tipoConexao === "INTERNAL_GATEWAY") {
		if (!chat.whatsappConexao.gatewaySessaoId) throw new createHttpError.BadRequest("Sessão do Gateway Interno não configurada.");
		if (chat.whatsappConexao.gatewayStatus !== "connected") {
			throw new createHttpError.BadRequest("Gateway Interno não está conectado. Reconecte escaneando o QR code.");
		}
	}

	const atendimentoAtivo = await db.query.chatAssignments.findFirst({
		where: and(
			eq(chatAssignments.chatId, chatId),
			eq(chatAssignments.organizacaoId, organizacaoId),
			notInArray(chatAssignments.status, [...CLOSED_ASSIGNMENT_STATUSES]),
		),
		orderBy: (fields, { desc }) => [desc(fields.dataAtribuicao)],
	});

	return {
		chat,
		atendimentoAtivo: atendimentoAtivo ?? null,
		janelaAberta: isWhatsappWindowOpen({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao }),
	};
}
export type TChatForSending = Awaited<ReturnType<typeof loadChatForSending>>["chat"];

/** Texto do template renderizado, para persistir na mensagem e exibir na thread. */
export function renderTemplatePlainContent(template: NonNullable<TApprovedTemplate>) {
	return buildWhatsappPlainContent({ template, variables: {} });
}

/**
 * Valida que o template existe, é da organização e está **aprovado para o número em uso**.
 *
 * A aprovação da Meta é por telefone e vive em `metadados.porNumeroTelefone[telefoneId]`;
 * a coluna `status` da tabela é o ciclo de vida interno (RASCUNHO/ATIVO/ARQUIVADO) e não
 * diz nada sobre a aprovação.
 */
export async function resolveApprovedTemplate({
	organizacaoId,
	messageTemplateId,
	whatsappTelefoneId,
}: {
	organizacaoId: string;
	messageTemplateId: string;
	whatsappTelefoneId: string | null;
}) {
	const template = await db.query.messageTemplates.findFirst({
		where: and(eq(messageTemplates.id, messageTemplateId), eq(messageTemplates.organizacaoId, organizacaoId)),
	});
	if (!template) throw new createHttpError.NotFound("Template não encontrado.");

	if (!whatsappTelefoneId) throw new createHttpError.BadRequest("Número do WhatsApp não configurado para este chat.");

	const phoneMetadata = template.metadados?.porNumeroTelefone?.[whatsappTelefoneId];
	if (phoneMetadata?.status !== "APROVADO") {
		throw new createHttpError.BadRequest(`O template "${template.nome}" não está aprovado para este número.`);
	}

	return template;
}

type TDeliverChatMessageParams = {
	messageId: string;
	chat: TChatForSending;
	texto: string;
	midia: TOutgoingMedia | null;
	template: TApprovedTemplate | null;
};

/**
 * Envia pelo provedor e grava o resultado na mensagem já persistida.
 *
 * Meta Cloud API responde de forma síncrona com o `whatsappMessageId` → `ENVIADA`.
 * O Gateway Interno enfileira e confirma por webhook → segue `PENDENTE`.
 */
export async function deliverChatMessage({ messageId, chat, texto, midia, template }: TDeliverChatMessageParams) {
	const conexao = chat.whatsappConexao;
	if (!conexao) throw new createHttpError.BadRequest("Conexão WhatsApp não configurada para este chat.");
	const telefoneCliente = chat.cliente?.telefone;
	if (!telefoneCliente) throw new createHttpError.BadRequest("Cliente não possui telefone cadastrado.");

	let whatsappMessageId: string | null = null;
	let statusEntrega: TChatMessageDeliveryStatus = "ENVIADA";
	let metadados: Record<string, unknown> | null = null;

	try {
		if (conexao.tipoConexao === "INTERNAL_GATEWAY") {
			const sessaoId = conexao.gatewaySessaoId as string;
			const destino = formatPhoneForInternalGateway(telefoneCliente);

			const content = template
				? parseTemplatePayloadToGatewayContent(
						buildWhatsappTemplateSendPayload({
							template,
							toPhoneNumber: telefoneCliente,
							runtimeContext: { origin: "CHAT_HUB", organizacaoId: chat.organizacaoId, clienteId: chat.clienteId, variaveis: {} },
						}),
						{ fallbackText: texto || undefined },
					)
				: midia
					? {
							type:
								midia.tipo === "IMAGEM"
									? ("image" as const)
									: midia.tipo === "VIDEO"
										? ("video" as const)
										: midia.tipo === "AUDIO"
											? ("audio" as const)
											: ("document" as const),
							text: texto || undefined,
							mediaUrl: getChatMediaUrl(midia.storageId),
							mediaFileName: midia.arquivoNome ?? undefined,
							mediaMimeType: midia.mimeType,
						}
					: { type: "text" as const, text: texto };

			const response = await sendInternalGatewayMessage(sessaoId, destino, content, { clientMessageId: messageId });
			if (!response.success) {
				throw new createHttpError.InternalServerError(response.error || "Falha ao enfileirar mensagem no Gateway Interno.");
			}
			// O gateway confirma a entrega por webhook; até lá a mensagem segue pendente.
			statusEntrega = "PENDENTE";
			metadados = { gatewayInterno: { sessaoId, jobId: response.jobId } };
		} else {
			const fromPhoneNumberId = chat.whatsappTelefoneId as string;
			const whatsappToken = conexao.token as string;

			if (template) {
				const response = await sendTemplateWhatsappMessage({
					fromPhoneNumberId,
					templatePayload: buildWhatsappTemplateSendPayload({
						template,
						toPhoneNumber: telefoneCliente,
						runtimeContext: { origin: "CHAT_HUB", organizacaoId: chat.organizacaoId, clienteId: chat.clienteId, variaveis: {} },
					}),
					whatsappToken,
				});
				whatsappMessageId = response.whatsappMessageId;
			} else if (midia) {
				const { data: fileData, error: downloadError } = await supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).download(midia.storageId);
				if (downloadError || !fileData) throw new createHttpError.InternalServerError("Erro ao baixar o arquivo do storage.");

				const upload = await uploadMediaToWhatsapp({
					fromPhoneNumberId,
					fileBuffer: Buffer.from(await fileData.arrayBuffer()),
					mimeType: midia.mimeType,
					filename: midia.arquivoNome || "arquivo",
					whatsappToken,
				});

				const response = await sendMediaWhatsappMessage({
					fromPhoneNumberId,
					toPhoneNumber: formatPhoneAsWhatsappId(telefoneCliente),
					media: { id: upload.mediaId },
					// VIDEO caía em "document" antes de o tipo existir na assinatura: o cliente recebia
					// o vídeo como arquivo para baixar, sem player.
					mediaType: midia.tipo === "IMAGEM" ? "image" : midia.tipo === "VIDEO" ? "video" : midia.tipo === "AUDIO" ? "audio" : "document",
					caption: texto || undefined,
					filename: midia.arquivoNome ?? undefined,
					whatsappToken,
				});
				whatsappMessageId = response.whatsappMessageId;
			} else {
				const response = await sendBasicWhatsappMessage({
					fromPhoneNumberId,
					toPhoneNumber: formatPhoneAsWhatsappId(telefoneCliente),
					content: texto,
					whatsappToken,
				});
				whatsappMessageId = response.whatsappMessageId;
			}
		}

		await db
			.update(chatMessages)
			.set({ whatsappMessageId, statusEntrega, provedorStatusDataAtualizacao: new Date(), metadados })
			.where(eq(chatMessages.id, messageId));

		return { whatsappMessageId, statusEntrega };
	} catch (error) {
		console.error("[ERROR] [CHAT_OUTGOING_MESSAGE] Falha no envio:", error);
		await db.update(chatMessages).set({ statusEntrega: "FALHA", provedorStatusDataAtualizacao: new Date() }).where(eq(chatMessages.id, messageId));
		throw error;
	}
}

/**
 * Reconstrói o input de envio de uma mensagem que falhou e a reenvia.
 * O envio de template não é reprocessado por aqui: o payload não é reconstruível a partir
 * da mensagem persistida, e reenviar template fora da janela tem custo por conversa.
 */
export function buildRetryMedia(message: typeof chatMessages.$inferSelect): TOutgoingMedia | null {
	if (!message.conteudoMidiaStorageId || message.conteudoMidiaTipo === "TEXTO") return null;
	return {
		tipo: message.conteudoMidiaTipo,
		storageId: message.conteudoMidiaStorageId,
		mimeType: message.conteudoMidiaMimeType || "application/octet-stream",
		arquivoNome: message.conteudoMidiaArquivoNome,
	};
}

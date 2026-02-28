import { type TChatDetailsForAgentResponse, getAgentResponse } from "@/lib/ai-agent";
import { handleAIAudioProcessing, handleAIDocumentProcessing, handleAIImageProcessing, handleAIVideoProcessing } from "@/lib/ai-media-processing";
import { uploadChatMedia } from "@/lib/files-storage/chat-media";
import { formatPhoneAsBase } from "@/lib/formatting";
import { downloadMedia, sendMessage as sendInternalGatewayMessage } from "@/lib/whatsapp/internal-gateway";
import { type AppWhatsappStatus, mapWhatsAppStatusToAppStatus } from "@/lib/whatsapp/parsing";
import { formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import type { TInteractionsStatusEnum } from "@/schemas/interactions";
import { db } from "@/services/drizzle";
import { chatMessages, chatServices, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { interactions } from "@/services/drizzle/schema/interactions";
import { supabaseClient } from "@/services/supabase";
import { waitUntil } from "@vercel/functions";
import { eq, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const API_SECRET = process.env.INTERNAL_WHATSAPP_GATEWAY_API_SECRET;
const AI_RESPONSE_DELAY_MS = 5000;

type WebhookEventType = "message.received" | "connection.update" | "message.sent" | "message.updated";
type WebhookMediaType = "image" | "video" | "audio" | "document" | "sticker" | "unknown";

type WebhookMessageReceivedData = {
	whatsappMessageId: string;
	author: {
		id: string;
		name: string;
		phoneNumber: string;
	};
	content: {
		text: string;
		mediaType: WebhookMediaType;
		mediaUrl?: string;
		mediaId?: string;
		mediaSize?: number;
	};
	date: string;
	echo: boolean;
};

type WebhookConnectionUpdateData = {
	status: "connected" | "disconnected" | "connecting" | "qr";
	qrCode?: string | null;
};

type WebhookMessageSentData = {
	clientMessageId?: string;
	whatsappMessageId: string;
	status?: "pending" | "sent";
	recipient?: {
		id: string;
		phoneNumber: string;
	};
	content?: {
		text?: string;
		mediaType?: WebhookMediaType;
	};
	date?: string;
};

type WebhookMessageUpdatedData = {
	clientMessageId?: string;
	whatsappMessageId?: string;
	status: "pending" | "sent" | "delivered" | "read" | "failed";
	author: {
		id: string;
		name: string;
		phoneNumber: string;
	};
};

type WebhookBody =
	| {
			event: "message.received";
			sessionId: string;
			data: WebhookMessageReceivedData;
	  }
	| {
			event: "connection.update";
			sessionId: string;
			timestamp: string;
			data: WebhookConnectionUpdateData;
	  }
	| {
			event: "message.sent";
			sessionId: string;
			data: WebhookMessageSentData;
	  }
	| {
			event: "message.updated";
			sessionId: string;
			data: WebhookMessageUpdatedData;
	  };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	// Only accept POST requests
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	const queryApiSecret = typeof req.query.apiSecret === "string" ? req.query.apiSecret : undefined;
	const authorizationHeader = req.headers.authorization;
	const bearerApiSecret = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length).trim() : undefined;
	const isAuthorized = queryApiSecret === API_SECRET || bearerApiSecret === API_SECRET;
	if (!isAuthorized) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Unauthorized request");
		return res.status(401).json({ error: "Unauthorized" });
	}

	const body = req.body as WebhookBody;

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Received event:", JSON.stringify(body, null, 2));

	// Return 200 immediately to acknowledge receipt
	res.status(200).json({ success: true });

	// Process webhook asynchronously
	try {
		waitUntil(
			processWebhookAsync(body).catch((error) => {
				console.error("[INTERNAL_WHATSAPP_WEBHOOK] Error processing webhook:", error);
			}),
		);
	} catch (error) {
		console.error("[INTERNAL_WHATSAPP_WEBHOOK] Error processing webhook:", error);
	}
}

async function processWebhookAsync(body: WebhookBody): Promise<void> {
	switch (body.event) {
		case "message.received":
			await handleIncomingMessage(body);
			break;
		case "connection.update":
			await handleConnectionUpdate(body);
			break;
		case "message.sent":
			await handleMessageSent(body);
			break;
		case "message.updated":
			await handleMessageUpdated(body);
			break;
	}
}

async function handleConnectionUpdate(body: Extract<WebhookBody, { event: "connection.update" }>): Promise<void> {
	const { sessionId, data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling connection update:", JSON.stringify(data, null, 2));
	if (!data.status) return;

	// Find connection by session ID
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { eq }) => eq(fields.gatewaySessaoId, sessionId),
	});

	if (!connection) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Connection not found for session:", sessionId);
		return;
	}

	// Update connection status
	const updateData: {
		gatewayStatus: string;
		gatewayUltimaConexao?: Date;
	} = {
		gatewayStatus: data.status,
	};

	if (data.status === "connected") {
		updateData.gatewayUltimaConexao = new Date();
	}

	const { whatsappConnections } = await import("@/services/drizzle/schema/whatsapp-connections");
	await db.update(whatsappConnections).set(updateData).where(eq(whatsappConnections.id, connection.id));

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Connection status updated:", {
		sessionId,
		status: data.status,
	});
}

async function handleIncomingMessage(body: Extract<WebhookBody, { event: "message.received" }>): Promise<void> {
	const { sessionId, data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling incoming message:", JSON.stringify(data, null, 2));
	if (!data.author?.phoneNumber || !data.whatsappMessageId) {
		console.error("[INTERNAL_WHATSAPP_WEBHOOK] Missing required fields in message");
		return;
	}

	// Find connection by session ID (including organization config)
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { eq }) => eq(fields.gatewaySessaoId, sessionId),
		with: {
			telefones: true,
			organizacao: {
				columns: { configuracao: true },
			},
		},
	});

	if (!connection) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Connection not found for session:", sessionId);
		return;
	}

	// Check if hubAtendimentos access is enabled
	const hasHubAccess = connection.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] hubAtendimentos disabled, skipping message insertion for session:", sessionId);
		return;
	}

	const organizacaoId = connection.organizacaoId;
	const connectionPhone = connection.telefones[0]; // Internal Gateway has one phone per connection

	if (!connectionPhone) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No phone found for connection");
		return;
	}

	const allowsAIService = connectionPhone.permitirAtendimentoIa;

	// Find or create client
	const phoneBase = formatPhoneAsBase(data.author.phoneNumber);
	let clientId: string | null = null;

	const existingClient = await db.query.clients.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.telefoneBase, phoneBase), eq(fields.organizacaoId, organizacaoId)),
	});

	if (existingClient) {
		clientId = existingClient.id;
	} else {
		const [newClient] = await db
			.insert(clients)
			.values({
				organizacaoId,
				nome: data.author.name || data.author.phoneNumber,
				telefone: data.author.phoneNumber,
				telefoneBase: phoneBase,
				canalAquisicao: "WHATSAPP",
			})
			.returning({ id: clients.id });
		clientId = newClient.id;
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] New client created:", clientId);
	}

	if (!clientId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Cannot process message without client ID");
		return;
	}

	// Find or create chat
	let chatId: string | null = null;
	const existingChat = await db.query.chats.findFirst({
		where: (fields, { and, eq }) =>
			and(eq(fields.organizacaoId, organizacaoId), eq(fields.clienteId, clientId), eq(fields.whatsappConexaoId, connection.id)),
	});

	if (existingChat) {
		chatId = existingChat.id;
	} else {
		const [newChat] = await db
			.insert(chats)
			.values({
				organizacaoId,
				clienteId: clientId,
				whatsappConexaoId: connection.id,
				whatsappConexaoTelefoneId: connectionPhone.id,
				whatsappTelefoneId: sessionId, // Use sessionId as identifier for Internal Gateway
				mensagensNaoLidas: 0,
				ultimaMensagemData: new Date(),
				ultimaMensagemConteudoTipo: "TEXTO",
				status: "ABERTA",
			})
			.returning({ id: chats.id });
		chatId = newChat.id;
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] New chat created:", chatId);
	}

	// Find or create service
	let serviceId: string | null = null;
	let serviceResponsibleType: "AI" | "USUÁRIO" | "BUSINESS-APP" | "CLIENTE" = allowsAIService ? "AI" : "USUÁRIO";

	const existingService = await db.query.chatServices.findFirst({
		where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
	});

	if (existingService) {
		serviceId = existingService.id;
		serviceResponsibleType = existingService.responsavelTipo;
	} else {
		const [newService] = await db
			.insert(chatServices)
			.values({
				organizacaoId,
				chatId,
				clienteId: clientId,
				responsavelTipo: serviceResponsibleType,
				descricao: "NÃO ESPECIFICADO",
				status: "PENDENTE",
			})
			.returning({ id: chatServices.id });
		serviceId = newService.id;
	}

	// Download and store media if present
	let mediaData: {
		storageId: string;
		publicUrl: string;
		mimeType: string;
		fileSize: number;
	} | null = null;

	if (data.content.mediaUrl) {
		try {
			const downloaded = await downloadMedia(data.content.mediaUrl);
			const uploaded = await uploadChatMedia({
				file: downloaded.buffer,
				organizacaoId,
				chatId,
				mimeType: downloaded.mimeType,
				filename: undefined,
			});
			mediaData = {
				storageId: uploaded.storageId,
				publicUrl: uploaded.publicUrl,
				mimeType: uploaded.mimeType,
				fileSize: uploaded.fileSize,
			};
			console.log("[INTERNAL_WHATSAPP_WEBHOOK] Media stored:", mediaData.storageId);
		} catch (error) {
			console.error("[INTERNAL_WHATSAPP_WEBHOOK] Error downloading media:", error);
		}
	}

	// Determine media type
	let midiaTipo: "TEXTO" | "IMAGEM" | "DOCUMENTO" | "VIDEO" | "AUDIO" = "TEXTO";
	if (data.content.mediaType === "image" || data.content.mediaType === "sticker") midiaTipo = "IMAGEM";
	else if (data.content.mediaType === "document") midiaTipo = "DOCUMENTO";
	else if (data.content.mediaType === "video") midiaTipo = "VIDEO";
	else if (data.content.mediaType === "audio") midiaTipo = "AUDIO";

	// Insert message
	const [insertedMessage] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId,
			autorTipo: "CLIENTE",
			autorClienteId: clientId,
			conteudoTexto: data.content.text || "",
			conteudoMidiaTipo: midiaTipo,
			conteudoMidiaUrl: mediaData?.publicUrl,
			conteudoMidiaStorageId: mediaData?.storageId,
			conteudoMidiaMimeType: mediaData?.mimeType,
			conteudoMidiaArquivoTamanho: mediaData?.fileSize ?? data.content.mediaSize,
			conteudoMidiaWhatsappId: data.content.mediaId,
			status: "RECEBIDO",
			whatsappMessageId: data.whatsappMessageId,
			whatsappMessageStatus: "ENTREGUE",
			servicoId: serviceId,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	// Update chat
	const aiScheduleTime = new Date(Date.now() + AI_RESPONSE_DELAY_MS);
	await db
		.update(chats)
		.set({
			ultimaMensagemId: insertedMessage.id,
			ultimaMensagemData: insertedMessage.dataEnvio,
			ultimaMensagemConteudoTexto: data.content.text || "",
			ultimaMensagemConteudoTipo: midiaTipo,
			mensagensNaoLidas: existingChat ? existingChat.mensagensNaoLidas + 1 : 1,
			ultimaInteracaoClienteData: new Date(),
			aiAgendamentoRespostaData: serviceResponsibleType === "AI" ? aiScheduleTime : null,
			status: "ABERTA",
		})
		.where(eq(chats.id, chatId));

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message created from:", data.author.phoneNumber);

	const requiresAiProcessing = serviceResponsibleType === "AI" || (mediaData && midiaTipo !== "TEXTO");

	if (requiresAiProcessing && allowsAIService) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] AI Processing required and allowed. Starting...");
		await handleAIProcessing({
			chatId,
			organizationId: organizacaoId,
			sessionId,
			aiMessageResponse: serviceResponsibleType === "AI" ? { scheduleAt: aiScheduleTime } : null,
			aiMessageMedia: mediaData
				? {
						messageId: insertedMessage.id,
						storageId: mediaData.storageId,
						mimeType: mediaData.mimeType,
						mediaType: midiaTipo as "IMAGEM" | "VIDEO" | "AUDIO" | "DOCUMENTO",
					}
				: null,
		});
	}
}

const INTERACTION_STATUS_MAPPING: Record<AppWhatsappStatus, TInteractionsStatusEnum> = {
	PENDENTE: "PENDENTE",
	ENVIADO: "ENVIADO",
	ENTREGUE: "ENTREGUE",
	LIDO: "LIDO",
	FALHOU: "FALHOU",
};

function getRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function resolveMessageTargets({
	clientMessageId,
	whatsappMessageId,
}: {
	clientMessageId?: string;
	whatsappMessageId?: string;
}): Promise<{
	chatMessageId: string | null;
	interactionId: string | null;
	interactionMetadados: Record<string, unknown>;
}> {
	if (clientMessageId) {
		const chatMessage = await db.query.chatMessages.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientMessageId),
			columns: { id: true },
		});
		if (chatMessage) {
			return {
				chatMessageId: chatMessage.id,
				interactionId: null,
				interactionMetadados: {},
			};
		}

		const interaction = await db.query.interactions.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientMessageId),
			columns: { id: true, metadados: true },
		});

		if (interaction) {
			const interactionMetadados = getRecord(interaction.metadados);
			const chatMessageIdFromMetadata =
				typeof interactionMetadados.chatMessageId === "string" ? interactionMetadados.chatMessageId : null;

			return {
				chatMessageId: chatMessageIdFromMetadata,
				interactionId: interaction.id,
				interactionMetadados,
			};
		}
	}

	if (whatsappMessageId) {
		const [chatMessage, interaction] = await Promise.all([
			db.query.chatMessages.findFirst({
				where: (fields, { eq }) => eq(fields.whatsappMessageId, whatsappMessageId),
				columns: { id: true },
			}),
			db.query.interactions.findFirst({
				where: sql`${interactions.metadados}->>'whatsappMessageId' = ${whatsappMessageId}`,
				columns: { id: true, metadados: true },
			}),
		]);

		return {
			chatMessageId: chatMessage?.id ?? null,
			interactionId: interaction?.id ?? null,
			interactionMetadados: getRecord(interaction?.metadados),
		};
	}

	return {
		chatMessageId: null,
		interactionId: null,
		interactionMetadados: {},
	};
}

async function handleMessageSent(body: Extract<WebhookBody, { event: "message.sent" }>): Promise<void> {
	const { data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling message sent:", JSON.stringify(data, null, 2));
	if (!data.whatsappMessageId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Missing whatsappMessageId in message sent");
		return;
	}

	const { status, whatsappStatus } = mapWhatsAppStatusToAppStatus(data.status ?? "sent");
	const targets = await resolveMessageTargets({
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});

	if (!targets.chatMessageId && !targets.interactionId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No targets found for message sent event");
		return;
	}

	if (targets.chatMessageId) {
		await db
			.update(chatMessages)
			.set({
				status,
				whatsappMessageStatus: whatsappStatus,
				whatsappMessageId: data.whatsappMessageId,
			})
			.where(eq(chatMessages.id, targets.chatMessageId));
	}

	if (targets.interactionId) {
		await db
			.update(interactions)
			.set({
				statusEnvio: INTERACTION_STATUS_MAPPING[whatsappStatus],
				metadados: {
					...targets.interactionMetadados,
					clientMessageId: data.clientMessageId ?? targets.interactionMetadados.clientMessageId,
					whatsappMessageId: data.whatsappMessageId,
				},
			})
			.where(eq(interactions.id, targets.interactionId));
	}

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message sent reconciled:", {
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});
}

async function handleMessageUpdated(body: Extract<WebhookBody, { event: "message.updated" }>): Promise<void> {
	const { data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling message updated:", JSON.stringify(data, null, 2));
	if (!data.whatsappMessageId && !data.clientMessageId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Missing identifiers in message update");
		return;
	}

	const { status, whatsappStatus } = mapWhatsAppStatusToAppStatus(data.status);
	const targets = await resolveMessageTargets({
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});

	if (!targets.chatMessageId && !targets.interactionId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No targets found for message updated event");
		return;
	}

	if (targets.chatMessageId) {
		await db
			.update(chatMessages)
			.set({
				status,
				whatsappMessageStatus: whatsappStatus,
				...(data.whatsappMessageId && { whatsappMessageId: data.whatsappMessageId }),
			})
			.where(eq(chatMessages.id, targets.chatMessageId));
	}

	if (targets.interactionId) {
		await db
			.update(interactions)
			.set({
				statusEnvio: INTERACTION_STATUS_MAPPING[whatsappStatus],
				metadados: {
					...targets.interactionMetadados,
					clientMessageId: data.clientMessageId ?? targets.interactionMetadados.clientMessageId,
					whatsappMessageId: data.whatsappMessageId ?? targets.interactionMetadados.whatsappMessageId,
				},
			})
			.where(eq(interactions.id, targets.interactionId));
	}

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message updated:", {
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
		status: data.status,
	});
}

type THandleAIProcessingParams = {
	chatId: string;
	organizationId: string;
	sessionId: string;
	aiMessageResponse: {
		scheduleAt: Date;
	} | null;
	aiMessageMedia: {
		messageId: string;
		storageId: string;
		mimeType: string;
		mediaType: "IMAGEM" | "DOCUMENTO" | "VIDEO" | "AUDIO";
	} | null;
};

async function handleAIProcessing({
	chatId,
	organizationId,
	sessionId,
	aiMessageResponse,
	aiMessageMedia,
}: THandleAIProcessingParams): Promise<void> {
	if (!aiMessageResponse && !aiMessageMedia) return;

	if (aiMessageMedia) {
		await handleAIMediaProcessing(aiMessageMedia.messageId, aiMessageMedia.storageId, aiMessageMedia.mimeType, aiMessageMedia.mediaType);
	}

	if (aiMessageResponse) {
		await handleAIMessageResponse(chatId, organizationId, sessionId, aiMessageResponse.scheduleAt);
	}
}

async function handleAIMessageResponse(chatId: string, organizacaoId: string, sessionId: string, scheduledAt: Date) {
	// Wait for the delay
	const delayMs = scheduledAt.getTime() - Date.now();
	if (delayMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}

	// Check if new messages arrived after scheduling
	const chat = await db.query.chats.findFirst({
		where: (fields, { eq }) => eq(fields.id, chatId),
		with: {
			cliente: true,
		},
	});

	if (!chat) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Chat not found:", chatId);
		return;
	}

	// If the scheduled time doesn't match, a newer message has reset the timer
	if (chat.aiAgendamentoRespostaData && chat.aiAgendamentoRespostaData.getTime() !== scheduledAt.getTime()) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Skipping - newer message arrived:", chatId);
		return;
	}

	// Check if service is still AI-handled
	const service = await db.query.chatServices.findFirst({
		where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
	});

	if (!service || service.responsavelTipo !== "AI") {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Skipping - service not AI-handled:", chatId);
		return;
	}

	// Get last 100 messages
	const messages = await db.query.chatMessages.findMany({
		where: (fields, { eq }) => eq(fields.chatId, chatId),
		orderBy: (fields, { desc }) => [desc(fields.dataEnvio)],
		limit: 100,
	});

	const chatSummary: TChatDetailsForAgentResponse = {
		id: chat.id,
		cliente: {
			idApp: chat.cliente?.id || "",
			nome: chat.cliente?.nome || "",
			cpfCnpj: "",
			telefone: chat.cliente?.telefone || "",
			email: chat.cliente?.email,
			localizacaoCep: chat.cliente?.localizacaoCep ?? undefined,
			localizacaoEstado: chat.cliente?.localizacaoEstado ?? undefined,
			localizacaoCidade: chat.cliente?.localizacaoCidade ?? undefined,
			localizacaoBairro: chat.cliente?.localizacaoBairro ?? undefined,
			localizacaoLogradouro: chat.cliente?.localizacaoLogradouro ?? undefined,
			localizacaoNumero: chat.cliente?.localizacaoNumero ?? undefined,
			localizacaoComplemento: chat.cliente?.localizacaoComplemento ?? undefined,
		},
		ultimasMensagens: messages.map((m) => ({
			id: m.id,
			autorTipo: m.autorTipo,
			conteudoTipo: m.conteudoMidiaTipo,
			conteudoTexto: m.conteudoTexto || `[${m.conteudoMidiaTipo}]: ${m.conteudoMidiaTextoProcessadoResumo || ""}`,
			conteudoMidiaUrl: m.conteudoMidiaUrl ?? undefined,
			dataEnvio: m.dataEnvio,
			atendimentoId: m.servicoId ?? undefined,
		})),
		atendimentoAberto: service
			? {
					id: service.id,
					descricao: service.descricao,
					status: service.status,
				}
			: null,
	};

	const aiResponse = await getAgentResponse({
		details: chatSummary,
	});
	await createAIMessage(chatId, organizacaoId, sessionId, aiResponse.message, aiResponse.metadata);

	return { success: true, content: aiResponse.message };
}

async function createAIMessage(
	chatId: string,
	organizacaoId: string,
	sessionId: string,
	content: string,
	metadata?: { serviceDescription?: string; escalation?: { applicable: boolean; reason?: string } },
): Promise<void> {
	const chat = await db.query.chats.findFirst({
		where: (fields, { eq }) => eq(fields.id, chatId),
		with: {
			cliente: true,
			whatsappConexao: {
				columns: {
					gatewaySessaoId: true,
					gatewayStatus: true,
				},
			},
		},
	});

	if (!chat || chat.status !== "ABERTA") {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Cannot send - chat closed or not found");
		return;
	}

	// Get or update service
	const service = await db.query.chatServices.findFirst({
		where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
	});

	const serviceId = service?.id;

	if (service && metadata?.serviceDescription) {
		await db
			.update(chatServices)
			.set({
				descricao: metadata.serviceDescription,
				...(metadata.escalation?.applicable && { responsavelTipo: "USUÁRIO" as const }),
			})
			.where(eq(chatServices.id, service.id));
	}

	// Insert AI message
	const [insertedMessage] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId,
			autorTipo: "AI",
			conteudoTexto: content,
			conteudoMidiaTipo: "TEXTO",
			status: "ENVIADO",
			whatsappMessageStatus: "PENDENTE",
			servicoId: serviceId,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	// Update chat
	await db
		.update(chats)
		.set({
			ultimaMensagemId: insertedMessage.id,
			ultimaMensagemData: insertedMessage.dataEnvio,
			ultimaMensagemConteudoTexto: content,
			ultimaMensagemConteudoTipo: "TEXTO",
		})
		.where(eq(chats.id, chatId));

	// Send via Internal Gateway
	if (chat.whatsappConexao?.gatewaySessaoId && chat.whatsappConexao?.gatewayStatus === "connected" && chat.cliente?.telefone) {
		try {
			const response = await sendInternalGatewayMessage(
				chat.whatsappConexao.gatewaySessaoId,
				formatPhoneForInternalGateway(chat.cliente.telefone),
				{
					type: "text",
					text: content,
				},
				{ clientMessageId: insertedMessage.id },
			);
			if (!response.success) {
				throw new Error(response.error || "Falha ao enfileirar mensagem AI no Gateway Interno");
			}

			await db
				.update(chatMessages)
				.set({
					whatsappMessageStatus: "PENDENTE",
				})
				.where(eq(chatMessages.id, insertedMessage.id));

			console.log("[INTERNAL_WHATSAPP_WEBHOOK] AI message sent:", insertedMessage.id);
		} catch (error) {
			console.error("[INTERNAL_WHATSAPP_WEBHOOK] AI message send failed:", error);
			await db.update(chatMessages).set({ whatsappMessageStatus: "FALHOU" }).where(eq(chatMessages.id, insertedMessage.id));
		}
	}
}

async function handleAIMediaProcessing(
	messageId: string,
	storageId: string,
	mimeType: string,
	mediaType: "IMAGEM" | "DOCUMENTO" | "VIDEO" | "AUDIO",
) {
	try {
		// Download file from Supabase Storage
		const { data: fileData, error: downloadError } = await supabaseClient.storage.from("files").download(storageId);

		if (downloadError || !fileData) {
			console.error("[INTERNAL_WHATSAPP_WEBHOOK] Download error:", downloadError);
			throw new Error("Erro ao baixar arquivo do storage");
		}
		const fileBuffer = Buffer.from(await fileData.arrayBuffer());
		let processedText = "";
		let summary = "";

		switch (mediaType) {
			case "AUDIO": {
				const result = await handleAIAudioProcessing(fileBuffer, mimeType);
				processedText = result.transcription;
				summary = result.summary;
				break;
			}
			case "IMAGEM": {
				const result = await handleAIImageProcessing(fileBuffer, mimeType);
				processedText = result.description;
				summary = result.summary;
				break;
			}
			case "VIDEO": {
				const result = await handleAIVideoProcessing(fileBuffer, mimeType);
				processedText = result.analysis;
				summary = result.summary;
				break;
			}
			case "DOCUMENTO": {
				const result = await handleAIDocumentProcessing(fileBuffer, mimeType);
				processedText = result.extraction;
				summary = result.summary;
				break;
			}
		}

		await db
			.update(chatMessages)
			.set({
				conteudoMidiaTextoProcessado: processedText,
				conteudoMidiaTextoProcessadoResumo: summary,
			})
			.where(eq(chatMessages.id, messageId));

		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Media processing completed for:", messageId);

		return {
			success: true,
			processedText,
			summary,
		};
	} catch (error) {
		console.error("[INTERNAL_WHATSAPP_WEBHOOK] Media processing error:", error);
		throw error;
	}
}

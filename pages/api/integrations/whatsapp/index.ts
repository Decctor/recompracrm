import { type TChatDetailsForAgentResponse, getAgentResponse } from "@/lib/ai-agent";
import { handleAIAudioProcessing, handleAIDocumentProcessing, handleAIImageProcessing, handleAIVideoProcessing } from "@/lib/ai-media-processing";
import { downloadAndStoreWhatsappMedia } from "@/lib/files-storage/chat-media";
import { formatPhoneAsBase } from "@/lib/formatting";
import {
	type AppWhatsappStatus,
	isMessageEchoEvent,
	isMessageEvent,
	isStatusUpdate,
	isTemplateEvent,
	mapWhatsAppStatusToAppStatus,
	parseStatusUpdate,
	parseTemplateCategoryUpdate,
	parseTemplateQualityUpdate,
	parseTemplateStatusUpdate,
	parseWebhookIncomingMessage,
	parseWebhookMessageEcho,
} from "@/lib/whatsapp/parsing";
import { formatPhoneAsWhatsappId } from "@/lib/whatsapp/utils";
import { InteractionsStatusEnum } from "@/schemas/interactions";
import type { TInteractionsStatusEnum } from "@/schemas/interactions";
import { db } from "@/services/drizzle";
import { chatMessages, chatServices, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { interactions } from "@/services/drizzle/schema/interactions";
import { whatsappTemplatePhones } from "@/services/drizzle/schema/whatsapp-templates";
import { supabaseClient } from "@/services/supabase";
import { eq, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const AI_RESPONSE_DELAY_MS = 5000; // 5 seconds delay before AI response

type WebhookBody = {
	object: string;
	entry: Array<{
		id: string;
		changes: Array<{
			value: {
				messaging_product: string;
				metadata: {
					display_phone_number: string;
					phone_number_id: string;
				};
				contacts?: Array<{
					profile: { name: string };
					wa_id: string;
				}>;
				messages?: Array<unknown>;
				statuses?: Array<unknown>;
			};
			field: string;
		}>;
	}>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	// Webhook verification (GET request)
	if (req.method === "GET") {
		console.log("[INFO] [WHATSAPP_WEBHOOK] [VERIFY] Query received:", req.query);
		const mode = req.query["hub.mode"];
		const token = req.query["hub.verify_token"];
		const challenge = req.query["hub.challenge"];

		if (mode && token) {
			if (mode === "subscribe" && token === VERIFY_TOKEN) {
				console.log("WEBHOOK_VERIFIED");
				return res.status(200).send(challenge);
			}
			console.log("WEBHOOK_VERIFICATION_FAILED");
			return res.status(403).json({ error: "Verification failed" });
		}

		return res.status(400).json({ error: "Missing parameters" });
	}

	// Webhook events (POST request)
	if (req.method === "POST") {
		const body = req.body as WebhookBody;

		console.log("[INFO] [WHATSAPP_WEBHOOK] [POST] Incoming webhook message:", JSON.stringify(body, null, 2));

		if (body.object === "whatsapp_business_account") {
			// Return 200 immediately to acknowledge receipt (WhatsApp requires < 20s)
			// res.status(200).json({ success: true });

			await processWebhookAsync(body);
			return res.status(200).json({ success: true });
		}

		return res.status(404).json({ error: "Event not supported" });
	}

	return res.status(405).json({ error: "Method not allowed" });
}

/**
 * Process webhook events asynchronously after returning 200 to WhatsApp
 */
async function processWebhookAsync(body: WebhookBody): Promise<void> {
	try {
		// Handle template events
		if (isTemplateEvent(body)) {
			await handleTemplateEvent(body);
			return;
		}

		// Handle status updates
		if (isStatusUpdate(body)) {
			await handleStatusUpdate(body);
			return;
		}
		// Handle incoming messages
		if (isMessageEvent(body)) {
			await handleIncomingMessage(body);
			return;
		}
		// Handle message echoes (WhatsApp Coexistence)
		if (isMessageEchoEvent(body)) {
			await handleMessageEcho(body);
			return;
		}
	} catch (error) {
		console.error("[WHATSAPP_WEBHOOK] Error processing webhook:", error);
	}
}

/**
 * Handle template status/quality/category updates
 * Now targets the whatsappTemplatePhones child table instead of parent
 */
async function handleTemplateEvent(body: WebhookBody): Promise<void> {
	const statusUpdate = parseTemplateStatusUpdate(body);
	if (statusUpdate?.status) {
		console.log("[WHATSAPP_WEBHOOK] Template status update:", statusUpdate);
		await db
			.update(whatsappTemplatePhones)
			.set({
				status: statusUpdate.status,
				...(statusUpdate.reason && { rejeicao: statusUpdate.reason }),
				dataAtualizacao: new Date(),
			})
			.where(eq(whatsappTemplatePhones.whatsappTemplateId, statusUpdate.messageTemplateId));
	}

	const qualityUpdate = parseTemplateQualityUpdate(body);
	if (qualityUpdate?.quality) {
		console.log("[WHATSAPP_WEBHOOK] Template quality update:", qualityUpdate);
		await db
			.update(whatsappTemplatePhones)
			.set({
				qualidade: qualityUpdate.quality,
				dataAtualizacao: new Date(),
			})
			.where(eq(whatsappTemplatePhones.whatsappTemplateId, qualityUpdate.messageTemplateId));
	}

	// Note: Category updates still apply to the parent template, but since category
	// is the same across all phones, we need to update via the parent.
	// For now, we'll skip category updates as they're less common and the parent
	// table no longer has whatsappTemplateId. If needed, we can lookup the parent
	// via the child table and update it.
	const categoryUpdate = parseTemplateCategoryUpdate(body);
	if (categoryUpdate?.category) {
		console.log("[WHATSAPP_WEBHOOK] Template category update received:", categoryUpdate);
		// Category updates would need to find the parent template through the child
		// and update it there. For now, logging only.
	}
}

const INTERACTION_STATUS_MAPPING: Record<AppWhatsappStatus, TInteractionsStatusEnum> = {
	PENDENTE: "PENDENTE",
	ENVIADO: "ENVIADO",
	ENTREGUE: "ENTREGUE",
	LIDO: "LIDO",
	FALHOU: "FALHOU",
};
/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function handleStatusUpdate(body: WebhookBody): Promise<void> {
	const statusUpdate = parseStatusUpdate(body);
	if (!statusUpdate) return;

	const { status, whatsappStatus } = mapWhatsAppStatusToAppStatus(statusUpdate.status);

	const previousInteraction = await db.query.interactions.findFirst({
		where: sql`${interactions.metadados}->>'whatsappMessageId' = ${statusUpdate.whatsappMessageId}`,
	});
	await db
		.update(chatMessages)
		.set({ status, whatsappMessageStatus: whatsappStatus })
		.where(eq(chatMessages.whatsappMessageId, statusUpdate.whatsappMessageId));

	await db
		.update(interactions)
		.set({
			statusEnvio: INTERACTION_STATUS_MAPPING[whatsappStatus],
			metadados: {
				...(previousInteraction?.metadados ?? {}),
				whatsappMessageId: statusUpdate.whatsappMessageId,
			},
		})
		.where(sql`${interactions.metadados}->>'whatsappMessageId' = ${statusUpdate.whatsappMessageId}`);
	console.log("[WHATSAPP_WEBHOOK] Status updated for message:", statusUpdate.whatsappMessageId);
}

/**
 * Handle incoming messages from clients
 */
async function handleIncomingMessage(body: WebhookBody): Promise<void> {
	const incomingMessage = parseWebhookIncomingMessage(body);
	console.log("[WHATSAPP_WEBHOOK] Incoming message:", incomingMessage);
	if (!incomingMessage) {
		console.error("[WHATSAPP_WEBHOOK] Failed to parse incoming message");
		return;
	}

	// Find WhatsApp connection by phone number ID (including organization config)
	const connectionPhone = await db.query.whatsappConnectionPhones.findFirst({
		where: (fields, { eq }) => eq(fields.whatsappTelefoneId, incomingMessage.whatsappPhoneNumberId),
		with: {
			conexao: {
				with: {
					organizacao: {
						columns: { configuracao: true },
					},
				},
			},
		},
	});

	if (!connectionPhone?.conexao) {
		console.warn("[WHATSAPP_WEBHOOK] No WhatsApp connection found for:", incomingMessage.whatsappPhoneNumberId);
		return;
	}

	// Check if hubAtendimentos access is enabled
	const hasHubAccess = connectionPhone.conexao.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[WHATSAPP_WEBHOOK] hubAtendimentos disabled, skipping message insertion for:", incomingMessage.whatsappPhoneNumberId);
		return;
	}

	const organizacaoId = connectionPhone.conexao.organizacaoId;
	const whatsappToken = connectionPhone.conexao.token!; // Meta Cloud API connections always have token
	const whatsappConexaoId = connectionPhone.conexaoId;
	const whatsappConexaoTelefoneId = connectionPhone.id;
	const allowsAIService = connectionPhone.permitirAtendimentoIa;
	// Find or create client
	let clientId: string | null = null;
	const phoneBase = formatPhoneAsBase(incomingMessage.fromPhoneNumber);

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
				nome: incomingMessage.profileName,
				telefone: incomingMessage.fromPhoneNumber,
				telefoneBase: phoneBase,
				canalAquisicao: "WHATSAPP",
			})
			.returning({ id: clients.id });
		clientId = newClient.id;
		console.log("[WHATSAPP_WEBHOOK] New client created:", clientId);
	}

	if (!clientId) {
		console.warn("[WHATSAPP_WEBHOOK] Cannot process message without client ID");
		return;
	}

	// Find or create chat
	let chatId: string | null = null;
	const existingChat = await db.query.chats.findFirst({
		where: (fields, { and, eq }) =>
			and(eq(fields.organizacaoId, organizacaoId), eq(fields.clienteId, clientId), eq(fields.whatsappTelefoneId, incomingMessage.whatsappPhoneNumberId)),
	});

	if (existingChat) {
		chatId = existingChat.id;
	} else {
		const [newChat] = await db
			.insert(chats)
			.values({
				organizacaoId,
				clienteId: clientId,
				whatsappConexaoId,
				whatsappConexaoTelefoneId,
				whatsappTelefoneId: incomingMessage.whatsappPhoneNumberId,
				mensagensNaoLidas: 0,
				ultimaMensagemData: new Date(),
				ultimaMensagemConteudoTipo: "TEXTO",
				status: "ABERTA",
			})
			.returning({ id: chats.id });
		chatId = newChat.id;
		console.log("[WHATSAPP_WEBHOOK] New chat created:", chatId);
	}

	// Find or create service
	let serviceId: string | null = null;
	// Initializing services as AI-handled if allowed, otherwise as USER-handled
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

	if (incomingMessage.mediaId && incomingMessage.mimeType) {
		try {
			mediaData = await downloadAndStoreWhatsappMedia({
				mediaId: incomingMessage.mediaId,
				mimeType: incomingMessage.mimeType,
				filename: incomingMessage.filename,
				organizacaoId,
				chatId,
				whatsappToken,
			});
			console.log("[WHATSAPP_WEBHOOK] Media stored:", mediaData.storageId);
		} catch (error) {
			console.error("[WHATSAPP_WEBHOOK] Error downloading media:", error);
		}
	}

	// Determine media type
	let midiaTipo: "TEXTO" | "IMAGEM" | "DOCUMENTO" | "VIDEO" | "AUDIO" = "TEXTO";
	if (incomingMessage.messageType === "image") midiaTipo = "IMAGEM";
	else if (incomingMessage.messageType === "document") midiaTipo = "DOCUMENTO";
	else if (incomingMessage.messageType === "video") midiaTipo = "VIDEO";
	else if (incomingMessage.messageType === "audio") midiaTipo = "AUDIO";

	// Insert message
	const [insertedMessage] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId,
			autorTipo: "CLIENTE", // messages coming from Webhook are from clients
			autorClienteId: clientId,
			conteudoTexto: incomingMessage.textContent || incomingMessage.caption || "",
			conteudoMidiaTipo: midiaTipo,
			conteudoMidiaUrl: mediaData?.publicUrl,
			conteudoMidiaStorageId: mediaData?.storageId,
			conteudoMidiaMimeType: mediaData?.mimeType,
			conteudoMidiaArquivoTamanho: mediaData?.fileSize,
			conteudoMidiaWhatsappId: incomingMessage.mediaId,
			status: "RECEBIDO",
			whatsappMessageId: incomingMessage.whatsappMessageId,
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
			ultimaMensagemConteudoTexto: incomingMessage.textContent || incomingMessage.caption,
			ultimaMensagemConteudoTipo: midiaTipo,
			mensagensNaoLidas: existingChat ? existingChat.mensagensNaoLidas + 1 : 1,
			ultimaInteracaoClienteData: new Date(),
			aiAgendamentoRespostaData: serviceResponsibleType === "AI" ? aiScheduleTime : null,
			status: "ABERTA",
		})
		.where(eq(chats.id, chatId));

	console.log("[WHATSAPP_WEBHOOK] Message created from:", incomingMessage.fromPhoneNumber);

	const requiresAiProcessing = serviceResponsibleType === "AI" || (mediaData && midiaTipo !== "TEXTO");

	console.log("[WHATSAPP_WEBHOOK] AI Processing checkings:", {
		REQUIRES_AI_PROCESSING: requiresAiProcessing,
		PHONE_NUMBER_ALLOW_AI_SERVICE: allowsAIService,
		DEFINED_SERVICE_RESPONSIBLE_TYPE: serviceResponsibleType,
	});
	if (requiresAiProcessing && allowsAIService) {
		console.log("[WHATSAPP_WEBHOOK] AI Processing required and allowed. Starting processing...");
		await handleAIProcessing({
			chatId,
			organizationId: organizacaoId,
			aiMessageResponse: requiresAiProcessing ? { scheduleAt: aiScheduleTime } : null,
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

/**
 * Handle message echoes from WhatsApp Business phone app (Coexistence)
 */
async function handleMessageEcho(body: WebhookBody): Promise<void> {
	const messageEcho = parseWebhookMessageEcho(body);
	if (!messageEcho) {
		console.error("[WHATSAPP_WEBHOOK] Failed to parse message echo");
		return;
	}

	// Find WhatsApp connection (including organization config)
	const connectionPhone = await db.query.whatsappConnectionPhones.findFirst({
		where: (fields, { eq }) => eq(fields.whatsappTelefoneId, messageEcho.whatsappPhoneNumberId),
		with: {
			conexao: {
				with: {
					organizacao: {
						columns: { configuracao: true },
					},
				},
			},
		},
	});

	if (!connectionPhone?.conexao) {
		console.warn("[WHATSAPP_WEBHOOK] [ECHO] No WhatsApp connection found");
		return;
	}

	// Check if hubAtendimentos access is enabled
	const hasHubAccess = connectionPhone.conexao.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[WHATSAPP_WEBHOOK] [ECHO] hubAtendimentos disabled, skipping message echo insertion");
		return;
	}

	const organizacaoId = connectionPhone.conexao.organizacaoId;
	const whatsappToken = connectionPhone.conexao.token!; // Meta Cloud API connections always have token
	const whatsappConexaoId = connectionPhone.conexaoId;
	const whatsappConexaoTelefoneId = connectionPhone.id;

	// Find or create client (recipient)
	const phoneBase = formatPhoneAsBase(messageEcho.toPhoneNumber);
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
				nome: messageEcho.toPhoneNumber,
				telefone: messageEcho.toPhoneNumber,
				telefoneBase: phoneBase,
				canalAquisicao: "WHATSAPP",
			})
			.returning({ id: clients.id });
		clientId = newClient.id;
	}

	if (!clientId) return;

	// Find or create chat
	let chatId: string | null = null;
	const existingChat = await db.query.chats.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.clienteId, clientId), eq(fields.whatsappTelefoneId, messageEcho.whatsappPhoneNumberId)),
	});

	if (existingChat) {
		chatId = existingChat.id;
	} else {
		const [newChat] = await db
			.insert(chats)
			.values({
				organizacaoId,
				clienteId: clientId,
				whatsappConexaoId,
				whatsappConexaoTelefoneId,
				whatsappTelefoneId: messageEcho.whatsappPhoneNumberId,
				mensagensNaoLidas: 0,
				ultimaMensagemData: new Date(),
				ultimaMensagemConteudoTipo: "TEXTO",
				status: "ABERTA",
			})
			.returning({ id: chats.id });
		chatId = newChat.id;
	}

	// Find or create service (mark as BUSINESS-APP handling)
	let serviceId: string | null = null;
	const existingService = await db.query.chatServices.findFirst({
		where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
	});

	if (existingService) {
		serviceId = existingService.id;
		if (existingService.responsavelTipo === "AI") {
			await db.update(chatServices).set({ responsavelTipo: "BUSINESS-APP" }).where(eq(chatServices.id, serviceId));
		}
	} else {
		const [newService] = await db
			.insert(chatServices)
			.values({
				organizacaoId,
				chatId,
				clienteId: clientId,
				responsavelTipo: "BUSINESS-APP",
				descricao: "NÃO ESPECIFICADO",
				status: "EM_ANDAMENTO",
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

	if (messageEcho.mediaId && messageEcho.mimeType) {
		try {
			mediaData = await downloadAndStoreWhatsappMedia({
				mediaId: messageEcho.mediaId,
				mimeType: messageEcho.mimeType,
				filename: messageEcho.filename,
				organizacaoId,
				chatId,
				whatsappToken,
			});
		} catch (error) {
			console.error("[WHATSAPP_WEBHOOK] [ECHO] Error downloading media:", error);
		}
	}

	// Determine media type
	let midiaTipo: "TEXTO" | "IMAGEM" | "DOCUMENTO" | "VIDEO" | "AUDIO" = "TEXTO";
	if (messageEcho.messageType === "image") midiaTipo = "IMAGEM";
	else if (messageEcho.messageType === "document") midiaTipo = "DOCUMENTO";
	else if (messageEcho.messageType === "video") midiaTipo = "VIDEO";
	else if (messageEcho.messageType === "audio") midiaTipo = "AUDIO";

	// Insert message
	const [insertedMessage] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId,
			autorTipo: "BUSINESS-APP",
			conteudoTexto: messageEcho.textContent || messageEcho.caption || "",
			conteudoMidiaTipo: midiaTipo,
			conteudoMidiaUrl: mediaData?.publicUrl,
			conteudoMidiaStorageId: mediaData?.storageId,
			conteudoMidiaMimeType: mediaData?.mimeType,
			conteudoMidiaArquivoTamanho: mediaData?.fileSize,
			conteudoMidiaWhatsappId: messageEcho.mediaId,
			status: "ENVIADO",
			whatsappMessageId: messageEcho.whatsappMessageId,
			whatsappMessageStatus: "ENVIADO",
			servicoId: serviceId,
			isEcho: true,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	// Update chat
	await db
		.update(chats)
		.set({
			ultimaMensagemId: insertedMessage.id,
			ultimaMensagemData: insertedMessage.dataEnvio,
			ultimaMensagemConteudoTexto: messageEcho.textContent || messageEcho.caption,
			ultimaMensagemConteudoTipo: midiaTipo,
			status: "ABERTA",
		})
		.where(eq(chats.id, chatId));

	console.log("[WHATSAPP_WEBHOOK] [ECHO] Message echo created to:", messageEcho.toPhoneNumber);
}

type THandleAIProcessingParams = {
	chatId: string;
	organizationId: string;
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

async function handleAIProcessing({ chatId, organizationId, aiMessageResponse, aiMessageMedia }: THandleAIProcessingParams): Promise<void> {
	if (!aiMessageResponse && !aiMessageMedia) return;

	if (aiMessageMedia) {
		await handleAIMediaProcessing(aiMessageMedia.messageId, aiMessageMedia.storageId, aiMessageMedia.mimeType, aiMessageMedia.mediaType);
	}

	if (aiMessageResponse) {
		await handleAIMessageResponse(chatId, organizationId, aiMessageResponse.scheduleAt);
	}
}
/**
 * Schedule AI response with delay and verification
 */
async function handleAIMessageResponse(chatId: string, organizacaoId: string, scheduledAt: Date) {
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
		console.log("[AI_RESPONSE] Chat not found:", chatId);
		return;
	}

	// If the scheduled time doesn't match, a newer message has reset the timer
	if (chat.aiAgendamentoRespostaData && chat.aiAgendamentoRespostaData.getTime() !== scheduledAt.getTime()) {
		console.log("[AI_RESPONSE] Skipping - newer message arrived:", chatId);
		return;
	}

	// Check if service is still AI-handled
	const service = await db.query.chatServices.findFirst({
		where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
	});

	if (!service || service.responsavelTipo !== "AI") {
		console.log("[AI_RESPONSE] Skipping - service not AI-handled:", chatId);
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
	await createAIMessage(chatId, organizacaoId, aiResponse.message, aiResponse.metadata);

	return { success: true, content: aiResponse.message };
}

/**
 * Create AI message and send via WhatsApp
 */
async function createAIMessage(
	chatId: string,
	organizacaoId: string,
	content: string,
	metadata?: { serviceDescription?: string; escalation?: { applicable: boolean; reason?: string } },
): Promise<void> {
	const chat = await db.query.chats.findFirst({
		where: (fields, { eq }) => eq(fields.id, chatId),
		with: {
			cliente: true,
			whatsappConexao: { columns: { token: true } },
		},
	});

	if (!chat || chat.status !== "ABERTA") {
		console.log("[AI_MESSAGE] Cannot send - chat closed or not found");
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

	// Send via WhatsApp
	if (chat.whatsappConexao?.token && chat.cliente?.telefone && chat.whatsappTelefoneId) {
		try {
			const { sendBasicWhatsappMessage } = await import("@/lib/whatsapp");
			const response = await sendBasicWhatsappMessage({
				fromPhoneNumberId: chat.whatsappTelefoneId,
				toPhoneNumber: formatPhoneAsWhatsappId(chat.cliente.telefone),
				content,
				whatsappToken: chat.whatsappConexao.token,
			});

			await db
				.update(chatMessages)
				.set({
					whatsappMessageId: response.whatsappMessageId,
					whatsappMessageStatus: "ENVIADO",
				})
				.where(eq(chatMessages.id, insertedMessage.id));

			console.log("[AI_MESSAGE] Sent successfully:", insertedMessage.id);
		} catch (error) {
			console.error("[AI_MESSAGE] Send failed:", error);
			await db.update(chatMessages).set({ whatsappMessageStatus: "FALHOU" }).where(eq(chatMessages.id, insertedMessage.id));
		}
	}
}

/**
 * Process media with AI (transcription, image analysis, etc.)
 */
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
			console.error("[PROCESS_MEDIA] Download error:", downloadError);
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

		console.log("[MEDIA_PROCESSING] Completed for message:", messageId);

		return {
			sucess: true,
			processedText,
			summary,
		};
	} catch (error) {
		console.error("[MEDIA_PROCESSING] Error:", error);
		throw error;
	}
}

import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { resolveAiResponseDelayMs } from "@/lib/chats/ai-trigger";
import { dispatchAiTurn } from "@/lib/chats/ai-turn-dispatch";
import { processChatMessageMedia } from "@/lib/chats/media-processing";
import {
	applyProviderDeliveryStatus,
	mapProviderStatusToDeliveryStatus,
	persistIncomingClientMessage,
	resolveIncomingChat,
} from "@/lib/chats/incoming-message";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql, missingMessageTemplatePhoneMetadataCondition } from "@/lib/db-utils";
import { uploadChatMedia } from "@/lib/files-storage/chat-media";
import { applyProviderStatusUpdate } from "@/lib/interactions/delivery-state";
import { downloadMedia } from "@/lib/whatsapp/internal-gateway";
import { resolveWhatsappClient } from "@/lib/whatsapp/contact-identity";
import type { TChatMessageContentTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema/chats";
import { interactions } from "@/services/drizzle/schema/interactions";
import { messageTemplates } from "@/services/drizzle/schema/message-templates";
import { and, eq, sql } from "drizzle-orm";

/**
 * Processamento dos webhooks do Gateway Interno de WhatsApp, extraído do route handler para
 * servir dois adapters no mesmo seam: o route (sob waitUntil, via
 * lib/external-events/archive.ts) e o script de replay do inbox.
 *
 * Contrato de erro: `processGatewayWebhookBody` LANÇA em falha — o desfecho é registrado
 * pelo adapter (runArchivedEventProcessing), nunca suprimido aqui.
 */
export type TGatewayWebhookEventType = "message.received" | "connection.update" | "message.sent" | "message.updated";
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

export type TGatewayWebhookBody =
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

const KNOWN_GATEWAY_EVENTS = new Set<string>([
	"message.received",
	"connection.update",
	"message.sent",
	"message.updated",
] satisfies TGatewayWebhookEventType[]);

/** Classificação para a coluna `tipo` do inbox: o próprio nome do evento do gateway. */
export function classifyGatewayWebhookBody(body: TGatewayWebhookBody): string {
	const event = (body as { event?: string }).event;
	return event && KNOWN_GATEWAY_EVENTS.has(event) ? event : "DESCONHECIDO";
}

/** Ownership para o backfill de `organizacaoId` no inbox: sessionId → conexão → organização. */
export async function resolveGatewayWebhookOrganizationId(body: TGatewayWebhookBody): Promise<string | null> {
	if (!body.sessionId) return null;
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { eq }) => eq(fields.gatewaySessaoId, body.sessionId),
		columns: { organizacaoId: true },
	});
	return connection?.organizacaoId ?? null;
}

export async function processGatewayWebhookBody(body: TGatewayWebhookBody): Promise<void> {
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

async function handleConnectionUpdate(body: Extract<TGatewayWebhookBody, { event: "connection.update" }>): Promise<void> {
	const { sessionId, data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling connection update:", JSON.stringify(data, null, 2));
	if (!data.status) return;

	// Find connection by session ID
	const connection = await db.query.whatsappConnections.findFirst({
		where: (fields, { eq }) => eq(fields.gatewaySessaoId, sessionId),
		with: {
			telefones: true,
		},
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

	if (data.status === "connected") {
		// Um UPDATE por telefone cobre todos os templates da organização de uma vez, mesclando apenas a chave
		// daquele telefone sobre o valor atual da linha. As condições restringem a escrita aos templates que
		// ainda não têm a entrada e aos telefones que continuam conectados, de modo que uma desconexão
		// concorrente não seja desfeita por este webhook.
		for (const phone of connection.telefones) {
			await db.transaction(async (tx) => {
				const connected = await lockConnectedWhatsappPhone({
					trx: tx,
					organizationId: connection.organizacaoId,
					phoneId: phone.id,
				});
				if (!connected) return;

				await tx
					.update(messageTemplates)
					.set({
						metadados: mergeMessageTemplatePhoneMetadataSql({
							entries: { [phone.id]: { idExterno: "", status: "APROVADO", qualidade: "ALTA" } },
							mode: "keep",
						}),
						dataAtualizacao: new Date(),
					})
					.where(and(eq(messageTemplates.organizacaoId, connection.organizacaoId), missingMessageTemplatePhoneMetadataCondition(phone.id)));
			});
		}
	}
	await reconcileOnboardingCampaigns({ executor: db, organizationId: connection.organizacaoId });
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Connection status updated:", {
		sessionId,
		status: data.status,
	});
}

async function handleIncomingMessage(body: Extract<TGatewayWebhookBody, { event: "message.received" }>): Promise<void> {
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

	const organizacaoId = connection.organizacaoId;
	const connectionPhone = connection.telefones[0]; // Internal Gateway has one phone per connection

	if (!connectionPhone) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No phone found for connection");
		return;
	}

	const allowsAIService = connectionPhone.permitirAtendimentoIa;

	// ESTÁGIO 1 — IDENTIDADE, sem gate: a base de contatos cresce com o tráfego mesmo para
	// organizações sem hub. O Gateway Interno não tem BSUID — identidade só por telefone.
	const resolvedClient = await resolveWhatsappClient({
		organizationId: organizacaoId,
		phoneNumber: data.author.phoneNumber,
		profileName: data.author.name,
	});
	if (!resolvedClient) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Mensagem sem identidade resolvível:", data.whatsappMessageId);
		return;
	}
	if (resolvedClient.isNew) console.log("[INTERNAL_WHATSAPP_WEBHOOK] New client created:", resolvedClient.clientId);
	const clientId = resolvedClient.clientId;

	// ESTÁGIO 2 — CONVERSA (gate do hub).
	const hasHubAccess = connection.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] hubAtendimentos disabled, skipping message insertion for session:", sessionId);
		return;
	}

	// No Gateway Interno o sessionId faz o papel do telefone na chave natural do chat.
	const { chatId, isNew } = await resolveIncomingChat({
		organizacaoId,
		clienteId: clientId,
		whatsappTelefoneId: sessionId,
		whatsappConexaoId: connection.id,
		whatsappConexaoTelefoneId: connectionPhone.id,
	});
	if (isNew) console.log("[INTERNAL_WHATSAPP_WEBHOOK] New chat created:", chatId);

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
	let midiaTipo: TChatMessageContentTypeEnum = "TEXTO";
	if (data.content.mediaType === "image") midiaTipo = "IMAGEM";
	// Antes a figurinha era achatada em IMAGEM, divergindo do caminho da Meta Cloud API.
	else if (data.content.mediaType === "sticker") midiaTipo = "FIGURINHA";
	else if (data.content.mediaType === "document") midiaTipo = "DOCUMENTO";
	else if (data.content.mediaType === "video") midiaTipo = "VIDEO";
	else if (data.content.mediaType === "audio") midiaTipo = "AUDIO";

	const insertedMessage = await persistIncomingClientMessage({
		organizacaoId,
		chatId,
		clienteId: clientId,
		// O Gateway Interno não tem janela de 24h: a sessão do WhatsApp Web é o limite.
		tipoConexao: "INTERNAL_GATEWAY",
		whatsappMessageId: data.whatsappMessageId,
		conteudoTexto: data.content.text || null,
		conteudoMidiaTipo: midiaTipo,
		midia: mediaData ? { ...mediaData, fileSize: mediaData.fileSize ?? data.content.mediaSize, whatsappMediaId: data.content.mediaId } : null,
		metadados: { gatewayInterno: { sessaoId: sessionId } },
	});

	// Reentrega do gateway: a mensagem já existe e todo o downstream já rodou na primeira entrega.
	if (!insertedMessage) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Mensagem duplicada ignorada:", data.whatsappMessageId);
		return;
	}

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message created from:", data.author.phoneNumber);

	if (mediaData && midiaTipo !== "TEXTO") {
		await processChatMessageMedia({
			messageId: insertedMessage.messageId,
			organizacaoId,
			storageId: mediaData.storageId,
			mimeType: mediaData.mimeType,
			mediaType: midiaTipo,
			log: "[INTERNAL_WHATSAPP_WEBHOOK]",
		});
	}

	if (!allowsAIService) return;

	// Capability de plano. Antes só `hubAtendimentos.acesso` era checado, e o atendimento por
	// IA rodava para qualquer organização com um número habilitado.
	const hasAiServiceAccess = connection.organizacao?.configuracao?.recursos?.iaAtendimento?.acesso ?? false;
	if (!hasAiServiceAccess) {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Recurso de atendimento com IA indisponível para a organização:", organizacaoId);
		return;
	}

	// Provisionamento lazy: a primeira mensagem cria o agente da organização.
	const agent = await ensureOrganizationAgent(db, organizacaoId);
	if (agent.status !== "ATIVO") {
		console.log("[INTERNAL_WHATSAPP_WEBHOOK] Agente de IA pausado para a organização:", organizacaoId);
		return;
	}

	// Debounce, claim, confirmação e run vivem no runner — o webhook só despacha. O canal de
	// entrega é resolvido pelo runner via resolveChatDeliverer, a partir da conexão do chat.
	await dispatchAiTurn(
		{
			organizationId: organizacaoId,
			chatId,
			triggerMessageId: insertedMessage.messageId,
			triggerMessageSentAt: insertedMessage.dataEnvio.toISOString(),
		},
		{ delayMs: resolveAiResponseDelayMs(agent.capacidades) },
	);
}

function getRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function resolveMessageTargets({ clientMessageId, whatsappMessageId }: { clientMessageId?: string; whatsappMessageId?: string }): Promise<{
	chatMessageId: string | null;
	interactionId: string | null;
	interactionOrganizationId: string | null;
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
				interactionOrganizationId: null,
				interactionMetadados: {},
			};
		}

		const interaction = await db.query.interactions.findFirst({
			where: (fields, { eq }) => eq(fields.id, clientMessageId),
			columns: { id: true, organizacaoId: true, metadados: true },
		});

		if (interaction) {
			const interactionMetadados = getRecord(interaction.metadados);
			const chatMessageIdFromMetadata = typeof interactionMetadados.chatMessageId === "string" ? interactionMetadados.chatMessageId : null;

			return {
				chatMessageId: chatMessageIdFromMetadata,
				interactionId: interaction.id,
				interactionOrganizationId: interaction.organizacaoId,
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
				columns: { id: true, organizacaoId: true, metadados: true },
			}),
		]);

		return {
			chatMessageId: chatMessage?.id ?? null,
			interactionId: interaction?.id ?? null,
			interactionOrganizationId: interaction?.organizacaoId ?? null,
			interactionMetadados: getRecord(interaction?.metadados),
		};
	}

	return {
		chatMessageId: null,
		interactionId: null,
		interactionOrganizationId: null,
		interactionMetadados: {},
	};
}

async function handleMessageSent(body: Extract<TGatewayWebhookBody, { event: "message.sent" }>): Promise<void> {
	const { data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling message sent:", JSON.stringify(data, null, 2));
	if (!data.whatsappMessageId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Missing whatsappMessageId in message sent");
		return;
	}

	const targets = await resolveMessageTargets({
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});

	if (!targets.chatMessageId && !targets.interactionId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No targets found for message sent event");
		return;
	}

	if (targets.chatMessageId) {
		const statusEntrega = mapProviderStatusToDeliveryStatus(data.status ?? "sent");
		if (data.whatsappMessageId) {
			await db.update(chatMessages).set({ whatsappMessageId: data.whatsappMessageId }).where(eq(chatMessages.id, targets.chatMessageId));
		}
		if (statusEntrega) await applyProviderDeliveryStatus({ statusEntrega, chatMessageId: targets.chatMessageId });
	}

	if (targets.interactionId) {
		await applyProviderStatusUpdate({
			clientMessageId: data.clientMessageId ?? targets.interactionId,
			whatsappMessageId: data.whatsappMessageId,
			status: data.status ?? "sent",
		});
	}

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message sent reconciled:", {
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});
}

async function handleMessageUpdated(body: Extract<TGatewayWebhookBody, { event: "message.updated" }>): Promise<void> {
	const { data } = body;
	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Handling message updated:", JSON.stringify(data, null, 2));
	if (!data.whatsappMessageId && !data.clientMessageId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] Missing identifiers in message update");
		return;
	}

	const targets = await resolveMessageTargets({
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
	});

	if (!targets.chatMessageId && !targets.interactionId) {
		console.warn("[INTERNAL_WHATSAPP_WEBHOOK] No targets found for message updated event");
		return;
	}

	if (targets.chatMessageId) {
		const statusEntrega = mapProviderStatusToDeliveryStatus(data.status);
		if (data.whatsappMessageId) {
			await db.update(chatMessages).set({ whatsappMessageId: data.whatsappMessageId }).where(eq(chatMessages.id, targets.chatMessageId));
		}
		if (statusEntrega) await applyProviderDeliveryStatus({ statusEntrega, chatMessageId: targets.chatMessageId });
	}

	if (targets.interactionId) {
		await applyProviderStatusUpdate({
			clientMessageId: data.clientMessageId ?? targets.interactionId,
			whatsappMessageId: data.whatsappMessageId,
			status: data.status,
		});
	}

	console.log("[INTERNAL_WHATSAPP_WEBHOOK] Message updated:", {
		clientMessageId: data.clientMessageId,
		whatsappMessageId: data.whatsappMessageId,
		status: data.status,
	});
}

import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";

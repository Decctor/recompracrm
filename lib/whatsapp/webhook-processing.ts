import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { resolveAiResponseDelayMs } from "@/lib/chats/ai-trigger";
import { dispatchAiTurn } from "@/lib/chats/ai-turn-dispatch";
import { processChatMessageMedia } from "@/lib/chats/media-processing";
import { resolveQuotedMessageByWhatsappId } from "@/lib/chats/resolve-quoted-message";
import {
	applyProviderDeliveryStatus,
	mapProviderStatusToDeliveryStatus,
	persistIncomingClientMessage,
	persistOutboundNonHubMessage,
	resolveIncomingChat,
} from "@/lib/chats/incoming-message";
import { lockConnectedWhatsappPhone, mergeMessageTemplatePhoneMetadataSql } from "@/lib/db-utils";
import { downloadAndStoreWhatsappMedia } from "@/lib/files-storage/chat-media";
import { applyProviderStatusUpdate } from "@/lib/interactions/delivery-state";
import {
	buildWhatsappTemplateSyncPatch,
	getMetaWhatsappTemplate,
	META_CATEGORY_TO_MESSAGE_TEMPLATE,
	type TMessageTemplateApprovalStatus,
	type TMessageTemplateCategory,
	type TMessageTemplateQuality,
} from "@/lib/message-templates";
import { resolveWhatsappClient } from "@/lib/whatsapp/contact-identity";
import {
	isMessageEchoEvent,
	isMessageEvent,
	isStatusUpdate,
	isTemplateEvent,
	parseTemplateCategoryUpdate,
	parseTemplateQualityUpdate,
	parseTemplateStatusUpdate,
	parseWebhookIncomingMessages,
	parseWebhookMessageEchoes,
	parseWebhookStatusUpdates,
} from "@/lib/whatsapp/parsing";
import {
	parseSmbAppStateSyncWebhook,
	resolveOrganizationIdByWhatsappPhoneNumberId,
	type TSmbAppStateSyncEvent,
	upsertClientsFromSmbAppStateSync,
} from "@/lib/whatsapp/smb-contacts-sync";
import {
	importWhatsappMessageHistoryEvents,
	parseWhatsappMessageHistoryWebhook,
	type TWhatsappMessageHistoryEvent,
} from "@/lib/whatsapp/smb-message-history-sync";
import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TMessageTemplateMetadata } from "@/schemas/message-templates";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema/chats";
import { messageTemplates } from "@/services/drizzle/schema/message-templates";
import { whatsappConnectionPhones } from "@/services/drizzle/schema/whatsapp-connections";
import { and, eq, sql } from "drizzle-orm";

/**
 * Processamento dos webhooks da Meta Cloud API (WhatsApp), extraído do route handler para
 * servir dois adapters no mesmo seam: o route (sob waitUntil, via
 * lib/external-events/archive.ts) e o script de replay do inbox.
 *
 * Contrato de erro: `processMetaWebhookBody` LANÇA em falha — quem registra o desfecho é o
 * adapter (runArchivedEventProcessing). Suprimir erros aqui faria o inbox e o replay
 * reportarem sucesso falso. Os try/catch internos que sobraram são tolerância deliberada a
 * falha parcial (mídia, sync de template), não supressão do desfecho do evento.
 */
export type TMetaWebhookBody = {
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
				history?: Array<unknown>;
				messages?: Array<unknown>;
				statuses?: Array<unknown>;
			};
			field: string;
		}>;
	}>;
};

/** Classificação rasa do body para a coluna `tipo` do inbox — consulta, não decisão. */
export function classifyMetaWebhookBody(body: TMetaWebhookBody): string {
	const kinds: string[] = [];
	if (parseSmbAppStateSyncWebhook(body).length > 0) kinds.push("SMB-APP-STATE");
	if (parseWhatsappMessageHistoryWebhook(body).length > 0) kinds.push("HISTORY");
	if (isTemplateEvent(body)) kinds.push("TEMPLATE");
	if (isStatusUpdate(body)) kinds.push("STATUSES");
	if (isMessageEvent(body) || isMessageEchoEvent(body)) kinds.push("MESSAGES");
	if (kinds.length === 0) return "DESCONHECIDO";
	return kinds.length === 1 ? kinds[0] : "MISTO";
}

/**
 * Ownership best-effort para o backfill de `organizacaoId` no inbox: resolve quando o body
 * inteiro pertence a um único telefone; múltiplos/nenhum ⇒ null (fica para a retenção).
 */
export async function resolveMetaWebhookOrganizationId(body: TMetaWebhookBody): Promise<string | null> {
	const phoneNumberIds = new Set<string>();
	for (const entry of body.entry ?? []) {
		for (const change of entry.changes ?? []) {
			const phoneNumberId = change.value?.metadata?.phone_number_id;
			if (phoneNumberId) phoneNumberIds.add(phoneNumberId);
		}
	}
	if (phoneNumberIds.size !== 1) return null;
	return resolveOrganizationIdByWhatsappPhoneNumberId([...phoneNumberIds][0]);
}

export async function processMetaWebhookBody(body: TMetaWebhookBody): Promise<void> {
	const contactsSyncEvents = parseSmbAppStateSyncWebhook(body);
	if (contactsSyncEvents.length > 0) {
		await handleSmbAppStateSync(contactsSyncEvents);
		return;
	}
	const messageHistoryEvents = parseWhatsappMessageHistoryWebhook(body);
	if (messageHistoryEvents.length > 0) {
		await handleWhatsappMessageHistory(messageHistoryEvents);
		return;
	}
	// Sem early return entre as categorias: um body "MISTO" (a Meta agrupa statuses e
	// messages numa entrega só) precisa processar todas, não só a primeira reconhecida.
	if (isTemplateEvent(body)) {
		await handleTemplateEvent(body);
	}
	if (isStatusUpdate(body)) {
		await handleStatusUpdates(body);
	}
	if (isMessageEvent(body)) {
		await handleIncomingMessages(body);
	}
	// Message echoes (WhatsApp Coexistence)
	if (isMessageEchoEvent(body)) {
		await handleMessageEchoes(body);
	}
}

async function handleWhatsappMessageHistory(events: TWhatsappMessageHistoryEvent[]): Promise<void> {
	const result = await importWhatsappMessageHistoryEvents(events);
	console.log("[WHATSAPP_WEBHOOK] [MESSAGE_HISTORY] Eventos processados:", result);
}

async function handleSmbAppStateSync(events: TSmbAppStateSyncEvent[]): Promise<void> {
	for (const event of events) {
		const organizationId = await resolveOrganizationIdByWhatsappPhoneNumberId(event.whatsappPhoneNumberId);
		if (!organizationId) {
			console.warn("[WHATSAPP_WEBHOOK] [SMB_APP_STATE_SYNC] Organização não encontrada para o telefone:", event.whatsappPhoneNumberId);
			continue;
		}

		const result = await upsertClientsFromSmbAppStateSync({
			organizationId,
			contacts: event.contacts,
		});
		console.log("[WHATSAPP_WEBHOOK] [SMB_APP_STATE_SYNC] Contatos processados:", {
			whatsappPhoneNumberId: event.whatsappPhoneNumberId,
			organizationId,
			...result,
		});
	}
}

/**
 * Handle template status/quality/category updates
 * Keeps the universal message template metadata in sync with Meta webhook events.
 */
async function handleTemplateEvent(body: TMetaWebhookBody): Promise<void> {
	const statusUpdate = parseTemplateStatusUpdate(body);
	if (statusUpdate?.status) {
		console.log("[WHATSAPP_WEBHOOK] Template status update:", statusUpdate);
		await updateUniversalTemplatePhoneMetadata(statusUpdate.messageTemplateId, {
			status: statusUpdate.status,
			rejeicao: statusUpdate.reason ?? null,
		});
		await syncUniversalTemplateComponentsFromMeta(statusUpdate.messageTemplateId);
	}

	const qualityUpdate = parseTemplateQualityUpdate(body);
	if (qualityUpdate?.quality) {
		console.log("[WHATSAPP_WEBHOOK] Template quality update:", qualityUpdate);
		await updateUniversalTemplatePhoneMetadata(qualityUpdate.messageTemplateId, {
			qualidade: qualityUpdate.quality,
		});
	}

	const categoryUpdate = parseTemplateCategoryUpdate(body);
	if (categoryUpdate?.category) {
		console.log("[WHATSAPP_WEBHOOK] Template category update received:", categoryUpdate);
		await updateUniversalTemplateCategory(categoryUpdate.messageTemplateId, categoryUpdate.category);
		await syncUniversalTemplateComponentsFromMeta(categoryUpdate.messageTemplateId);
	}
}

function mapMetaWebhookCategory(category: string): TMessageTemplateCategory | null {
	const normalizedCategory = category.toUpperCase() as keyof typeof META_CATEGORY_TO_MESSAGE_TEMPLATE;
	return META_CATEGORY_TO_MESSAGE_TEMPLATE[normalizedCategory] ?? null;
}

async function findUniversalTemplatesByMetaTemplateId(messageTemplateId: string) {
	return db.query.messageTemplates.findMany({
		where: sql`EXISTS (
			SELECT 1
			FROM jsonb_each(${messageTemplates.metadados}->'porNumeroTelefone') AS entry(key, value)
			WHERE value->>'idExterno' = ${messageTemplateId}
		)`,
	});
}

async function updateUniversalTemplatePhoneMetadata(
	messageTemplateId: string,
	update: { status?: TMessageTemplateApprovalStatus; qualidade?: TMessageTemplateQuality; rejeicao?: string | null },
): Promise<void> {
	const templates = await findUniversalTemplatesByMetaTemplateId(messageTemplateId);
	for (const template of templates) {
		// Apenas as entradas do template notificado pela Meta são regravadas; as demais chaves ficam com o
		// valor que estiver no banco no momento do UPDATE, e o modo `existing-only` impede que um telefone
		// desconectado em paralelo retorne através do snapshot lido acima.
		const changedPhoneMetadata = Object.fromEntries(
			Object.entries(template.metadados.porNumeroTelefone)
				.filter(([, metadata]) => metadata.idExterno === messageTemplateId)
				.map(([phoneId, metadata]) => [
					phoneId,
					{
						...metadata,
						...(update.status ? { status: update.status } : {}),
						...(update.qualidade ? { qualidade: update.qualidade } : {}),
					},
				]),
		) satisfies TMessageTemplateMetadata["porNumeroTelefone"];
		if (Object.keys(changedPhoneMetadata).length === 0) continue;

		await db
			.update(messageTemplates)
			.set({
				metadados: mergeMessageTemplatePhoneMetadataSql({ entries: changedPhoneMetadata, mode: "existing-only" }),
				...(update.rejeicao ? { alerta: update.rejeicao } : {}),
				dataAtualizacao: new Date(),
			})
			.where(eq(messageTemplates.id, template.id));
		if (update.status) await reconcileOnboardingCampaigns({ executor: db, organizationId: template.organizacaoId });
	}
}

async function updateUniversalTemplateCategory(messageTemplateId: string, category: string): Promise<void> {
	const mappedCategory = mapMetaWebhookCategory(category);
	if (!mappedCategory) return;

	const templates = await findUniversalTemplatesByMetaTemplateId(messageTemplateId);
	for (const template of templates) {
		await db
			.update(messageTemplates)
			.set({
				categoria: mappedCategory,
				dataAtualizacao: new Date(),
			})
			.where(eq(messageTemplates.id, template.id));
	}
}

async function syncUniversalTemplateComponentsFromMeta(messageTemplateId: string): Promise<void> {
	const templates = await findUniversalTemplatesByMetaTemplateId(messageTemplateId);
	for (const template of templates) {
		const matchingPhoneIds = Object.entries(template.metadados.porNumeroTelefone)
			.filter(([, metadata]) => metadata.idExterno === messageTemplateId)
			.map(([phoneId]) => phoneId);

		for (const phoneId of matchingPhoneIds) {
			try {
				const phone = await db.query.whatsappConnectionPhones.findFirst({
					where: eq(whatsappConnectionPhones.id, phoneId),
					with: { conexao: { columns: { token: true } } },
				});
				if (!phone?.conexao?.token) continue;

				const metaTemplate = await getMetaWhatsappTemplate({
					accessToken: phone.conexao.token,
					templateId: messageTemplateId,
				});
				const patch = buildWhatsappTemplateSyncPatch({
					template,
					connectionId: phoneId,
					metaTemplate,
				});
				const phoneMetadata = patch.metadados.porNumeroTelefone[phoneId];
				if (!phoneMetadata) continue;

				// A chamada à Meta acima abre uma janela entre a leitura do template e a gravação: a mescla
				// dentro do UPDATE e a condição do telefone impedem que uma desconexão ocorrida nesse intervalo
				// seja desfeita.
				await db.transaction(async (tx) => {
					const connected = await lockConnectedWhatsappPhone({
						trx: tx,
						organizationId: template.organizacaoId,
						phoneId,
					});
					if (!connected) return;

					await tx
						.update(messageTemplates)
						.set({
							nome: patch.nome,
							categoria: patch.categoria,
							linguagem: patch.linguagem,
							conteudo: patch.conteudo,
							metadados: mergeMessageTemplatePhoneMetadataSql({ entries: { [phoneId]: phoneMetadata }, mode: "replace" }),
							alerta: patch.alerta,
							dataAtualizacao: new Date(),
						})
						.where(and(eq(messageTemplates.id, template.id), eq(messageTemplates.organizacaoId, template.organizacaoId)));
				});
			} catch (error) {
				console.error("[WHATSAPP_WEBHOOK] Failed to sync universal template components:", {
					messageTemplateId,
					phoneId,
					error,
				});
			}
		}
	}
}

/**
 * Handle message status updates (sent, delivered, read, failed)
 */
async function handleStatusUpdates(body: TMetaWebhookBody): Promise<void> {
	for (const statusUpdate of parseWebhookStatusUpdates(body)) {
		await handleStatusUpdate(statusUpdate);
	}
}

async function handleStatusUpdate(statusUpdate: ReturnType<typeof parseWebhookStatusUpdates>[number]): Promise<void> {
	await observeWhatsappPayment(statusUpdate);

	const statusEntrega = mapProviderStatusToDeliveryStatus(statusUpdate.status);
	if (statusEntrega) {
		// Sem regressão: a Meta entrega eventos fora de ordem, e um "sent" atrasado não
		// pode rebaixar uma mensagem já marcada como lida.
		await applyProviderDeliveryStatus({ statusEntrega, whatsappMessageId: statusUpdate.whatsappMessageId });
	}

	// Interações de campanha: mesmo ponto de aplicação do gateway interno (quota inclusa).
	await applyProviderStatusUpdate({
		whatsappMessageId: statusUpdate.whatsappMessageId,
		status: statusUpdate.status,
		errorMessage: statusUpdate.errorMessage,
		metadataPatch: statusUpdate.errors && statusUpdate.errors.length > 0 ? { whatsappErrors: statusUpdate.errors } : undefined,
	});
	console.log("[WHATSAPP_WEBHOOK] Status updated for message:", statusUpdate.whatsappMessageId);
}

/**
 * Handle incoming messages from clients
 */
async function handleIncomingMessages(body: TMetaWebhookBody): Promise<void> {
	const incomingMessages = parseWebhookIncomingMessages(body);
	if (incomingMessages.length === 0) {
		console.error("[WHATSAPP_WEBHOOK] Failed to parse incoming messages");
		return;
	}
	for (const incomingMessage of incomingMessages) {
		await handleIncomingMessage(incomingMessage);
	}
}

async function handleIncomingMessage(incomingMessage: ReturnType<typeof parseWebhookIncomingMessages>[number]): Promise<void> {
	console.log("[WHATSAPP_WEBHOOK] Incoming message:", incomingMessage);

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

	const organizacaoId = connectionPhone.conexao.organizacaoId;
	const whatsappToken = connectionPhone.conexao.token!; // Meta Cloud API connections always have token
	const whatsappConexaoId = connectionPhone.conexaoId;
	const whatsappConexaoTelefoneId = connectionPhone.id;
	const allowsAIService = connectionPhone.permitirAtendimentoIa;

	// A reação não é uma mensagem de conversa: anexa o emoji à mensagem-alvo e encerra.
	if (incomingMessage.kind === "reaction" && incomingMessage.reaction) {
		await attachWhatsappReaction({
			organizacaoId,
			reaction: incomingMessage.reaction,
			senderPhoneNumber: incomingMessage.fromPhoneNumber,
			date: new Date(incomingMessage.timestamp),
		});
		return;
	}

	// Edição do cliente: reescreve a mensagem original. Sem a original na base, segue como
	// mensagem nova com o texto editado — melhor que perder o que o cliente escreveu.
	if (incomingMessage.kind === "edit" && incomingMessage.edit) {
		const applied = await applyWhatsappEdit({ organizacaoId, edit: incomingMessage.edit, date: new Date(incomingMessage.timestamp) });
		if (applied) return;
	}

	// Mensagem de sistema (ex.: troca de número): registrada sem criar mensagem vazia no chat.
	if (incomingMessage.kind === "system" && incomingMessage.system) {
		console.log("[WHATSAPP_WEBHOOK] [SYSTEM] Mensagem de sistema recebida:", {
			organizacaoId,
			type: incomingMessage.system.type,
			body: incomingMessage.system.body,
			newWaId: incomingMessage.system.newWaId,
		});
		return;
	}

	// ESTÁGIO 1 — IDENTIDADE, sem gate: a base de contatos e o BSUID crescem com o tráfego
	// de WhatsApp mesmo para organizações sem hub de atendimentos.
	const resolvedClient = await resolveWhatsappClient({
		organizationId: organizacaoId,
		phoneNumber: incomingMessage.fromPhoneNumber,
		whatsappUserId: incomingMessage.whatsappUserId,
		profileName: incomingMessage.profileName,
	});
	if (!resolvedClient) {
		console.warn("[WHATSAPP_WEBHOOK] Mensagem sem identidade resolvível (sem telefone e sem BSUID):", incomingMessage.whatsappMessageId);
		return;
	}
	if (resolvedClient.isNew) console.log("[WHATSAPP_WEBHOOK] New client created:", resolvedClient.clientId);
	const clientId = resolvedClient.clientId;

	// ESTÁGIO 2 — CONVERSA: daqui em diante é acompanhamento de mensagens, o que o hub gate
	// de fato governa.
	const hasHubAccess = connectionPhone.conexao.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[WHATSAPP_WEBHOOK] hubAtendimentos disabled, skipping message insertion for:", incomingMessage.whatsappPhoneNumberId);
		return;
	}

	// Upsert pela chave natural: webhooks concorrentes criavam chats duplicados antes da 0052.
	const { chatId, isNew } = await resolveIncomingChat({
		organizacaoId,
		clienteId: clientId,
		whatsappTelefoneId: incomingMessage.whatsappPhoneNumberId,
		whatsappConexaoId,
		whatsappConexaoTelefoneId,
	});
	if (isNew) console.log("[WHATSAPP_WEBHOOK] New chat created:", chatId);

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

	const midiaTipo = incomingMessage.messageType;

	// Resposta a uma mensagem: o snapshot da citada é resolvido agora, para o painel continuar
	// legível quando a original sair do histórico carregado.
	const quotedMessage = incomingMessage.context?.quotedWhatsappMessageId
		? await resolveQuotedMessageByWhatsappId({ organizacaoId, whatsappMessageId: incomingMessage.context.quotedWhatsappMessageId })
		: null;

	const metadados: TChatMessageMetadata = {
		...(incomingMessage.referral ? { whatsappReferral: incomingMessage.referral } : {}),
		...(midiaTipo === "FIGURINHA" ? { whatsappMidia: { animated: incomingMessage.stickerAnimated ?? false } } : {}),
		...(incomingMessage.button ? { whatsappButton: incomingMessage.button } : {}),
		...(incomingMessage.unsupported ? { whatsappUnsupported: incomingMessage.unsupported } : {}),
		...(incomingMessage.location ? { whatsappLocation: incomingMessage.location } : {}),
		...(incomingMessage.contacts && incomingMessage.contacts.length > 0 ? { whatsappContacts: incomingMessage.contacts } : {}),
		...(incomingMessage.context ? { whatsappContext: incomingMessage.context } : {}),
		...(quotedMessage ? { quotedMessage } : {}),
	};

	// Tipo não suportado não tem texto próprio: entra como nota honesta, em vez de um
	// placeholder que finge ser um tipo desconhecido.
	const fallbackTextContent = incomingMessage.kind === "unsupported" ? "Mensagem não suportada pelo WhatsApp." : null;

	// Persiste, atualiza a denormalização do chat, renova a janela de 24h e reabre a
	// pendência do atendimento — tudo em lib/chats/incoming-message.ts, compartilhado
	// com o webhook do Gateway Interno.
	const insertedMessage = await persistIncomingClientMessage({
		organizacaoId,
		chatId,
		clienteId: clientId,
		tipoConexao: "META_CLOUD_API",
		whatsappMessageId: incomingMessage.whatsappMessageId,
		conteudoTexto: incomingMessage.textContent || incomingMessage.caption || fallbackTextContent,
		conteudoMidiaTipo: midiaTipo,
		midia: mediaData ? { ...mediaData, whatsappMediaId: incomingMessage.mediaId } : null,
		metadados: Object.keys(metadados).length > 0 ? metadados : null,
		now: new Date(incomingMessage.timestamp),
	});

	// Reentrega da Meta: a mensagem já existe e todo o downstream (contador, pendência,
	// transcrição, gatilho de IA) já rodou na primeira entrega.
	if (!insertedMessage) {
		console.log("[WHATSAPP_WEBHOOK] Mensagem duplicada ignorada:", incomingMessage.whatsappMessageId);
		return;
	}

	console.log("[WHATSAPP_WEBHOOK] Message created from:", incomingMessage.fromPhoneNumber);

	// A transcrição/OCR de mídia é independente do atendimento: roda mesmo que a IA não
	// vá responder, porque o texto processado alimenta a busca e o contexto do humano.
	if (mediaData && midiaTipo !== "TEXTO") {
		await processChatMessageMedia({
			messageId: insertedMessage.messageId,
			organizacaoId,
			storageId: mediaData.storageId,
			mimeType: mediaData.mimeType,
			mediaType: midiaTipo,
			log: "[WHATSAPP_WEBHOOK]",
		});
	}

	if (!allowsAIService) return;

	// Capability de plano. Antes só `hubAtendimentos.acesso` era checado, e o atendimento por
	// IA rodava para qualquer organização com um número habilitado.
	const hasAiServiceAccess = connectionPhone.conexao.organizacao?.configuracao?.recursos?.iaAtendimento?.acesso ?? false;
	if (!hasAiServiceAccess) {
		console.log("[WHATSAPP_WEBHOOK] Recurso de atendimento com IA indisponível para a organização:", organizacaoId);
		return;
	}

	// Provisionamento lazy: a primeira mensagem cria o agente da organização.
	const agent = await ensureOrganizationAgent(db, organizacaoId);
	if (agent.status !== "ATIVO") {
		console.log("[WHATSAPP_WEBHOOK] Agente de IA pausado para a organização:", organizacaoId);
		return;
	}

	// Debounce, claim, confirmação e run vivem no runner — o webhook só despacha.
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

/**
 * Anexa uma reação (ou o "unreact") na mensagem-alvo, no histórico
 * `metadados.whatsappReactions` — a última ação por emoji vence na renderização.
 */
async function attachWhatsappReaction(input: {
	organizacaoId: string;
	reaction: { targetWhatsappMessageId: string; emoji: string | null };
	senderPhoneNumber: string | null;
	date: Date;
}): Promise<void> {
	const targetMessage = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.organizacaoId, input.organizacaoId), eq(chatMessages.whatsappMessageId, input.reaction.targetWhatsappMessageId)),
		columns: { id: true, metadados: true },
	});
	if (!targetMessage) {
		console.warn("[WHATSAPP_WEBHOOK] [REACTION] Mensagem-alvo da reação não encontrada:", input.reaction.targetWhatsappMessageId);
		return;
	}

	const metadados = targetMessage.metadados ?? {};
	const reactions = [...(metadados.whatsappReactions ?? [])];
	reactions.push({
		action: input.reaction.emoji ? "react" : "unreact",
		emoji: input.reaction.emoji,
		senderPhoneNumber: input.senderPhoneNumber,
		date: input.date.toISOString(),
	});

	await db
		.update(chatMessages)
		.set({ metadados: { ...metadados, whatsappReactions: reactions } })
		.where(eq(chatMessages.id, targetMessage.id));
}

/**
 * Aplica a edição de uma mensagem feita no WhatsApp: o texto novo substitui `conteudoTexto` e o
 * anterior vai para `metadados.whatsappEdits`. Antes, cada edição virava uma mensagem-placeholder
 * "[Mensagem do tipo "edit" recebida]", que poluía o histórico do hub e o contexto da IA.
 *
 * Devolve `false` quando a mensagem original não está na base (enviada antes da conexão, ou
 * fora do hub), para o chamador persistir o texto como mensagem nova.
 */
async function applyWhatsappEdit(input: {
	organizacaoId: string;
	edit: { originalWhatsappMessageId: string; textContent: string };
	date: Date;
}): Promise<boolean> {
	const targetMessage = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.organizacaoId, input.organizacaoId), eq(chatMessages.whatsappMessageId, input.edit.originalWhatsappMessageId)),
		columns: { id: true, conteudoTexto: true, metadados: true },
	});
	if (!targetMessage) {
		console.warn("[WHATSAPP_WEBHOOK] [EDIT] Mensagem original da edição não encontrada:", input.edit.originalWhatsappMessageId);
		return false;
	}

	const metadados = targetMessage.metadados ?? {};
	const edits = [...(metadados.whatsappEdits ?? []), { previousText: targetMessage.conteudoTexto, date: input.date.toISOString() }];

	await db
		.update(chatMessages)
		.set({ conteudoTexto: input.edit.textContent, metadados: { ...metadados, whatsappEdits: edits } })
		.where(eq(chatMessages.id, targetMessage.id));
	return true;
}

/**
 * Handle message echoes from WhatsApp Business phone app (Coexistence)
 */
async function handleMessageEchoes(body: TMetaWebhookBody): Promise<void> {
	const messageEchoes = parseWebhookMessageEchoes(body);
	if (messageEchoes.length === 0) {
		console.error("[WHATSAPP_WEBHOOK] Failed to parse message echoes");
		return;
	}
	for (const messageEcho of messageEchoes) {
		await handleMessageEcho(messageEcho);
	}
}

async function handleMessageEcho(messageEcho: ReturnType<typeof parseWebhookMessageEchoes>[number]): Promise<void> {
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

	const organizacaoId = connectionPhone.conexao.organizacaoId;
	const whatsappToken = connectionPhone.conexao.token!; // Meta Cloud API connections always have token
	const whatsappConexaoId = connectionPhone.conexaoId;
	const whatsappConexaoTelefoneId = connectionPhone.id;

	// Reação feita pelo celular da loja: vai para a mensagem-alvo, como a do cliente. Antes caía
	// na persistência e virava uma mensagem vazia no chat.
	if (messageEcho.kind === "reaction" && messageEcho.reaction) {
		await attachWhatsappReaction({
			organizacaoId,
			reaction: messageEcho.reaction,
			senderPhoneNumber: messageEcho.fromPhoneNumber,
			date: new Date(messageEcho.timestamp),
		});
		return;
	}

	// Edição feita no celular da loja: reescreve a mensagem ecoada antes. Não é resposta nova,
	// então também não mexe no atendimento.
	if (messageEcho.kind === "edit" && messageEcho.edit) {
		const applied = await applyWhatsappEdit({ organizacaoId, edit: messageEcho.edit, date: new Date(messageEcho.timestamp) });
		if (applied) return;
	}

	// ESTÁGIO 1 — IDENTIDADE, sem gate: o destinatário de um echo também é contato da base.
	const resolvedClient = await resolveWhatsappClient({
		organizationId: organizacaoId,
		phoneNumber: messageEcho.toPhoneNumber,
		whatsappUserId: messageEcho.toUserId,
	});
	if (!resolvedClient) {
		console.warn("[WHATSAPP_WEBHOOK] [ECHO] Echo sem identidade resolvível (sem telefone e sem BSUID):", messageEcho.whatsappMessageId);
		return;
	}
	const clientId = resolvedClient.clientId;

	// ESTÁGIO 2 — CONVERSA (gate do hub).
	const hasHubAccess = connectionPhone.conexao.organizacao?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) {
		console.log("[WHATSAPP_WEBHOOK] [ECHO] hubAtendimentos disabled, skipping message echo insertion");
		return;
	}

	const { chatId } = await resolveIncomingChat({
		organizacaoId,
		clienteId: clientId,
		whatsappTelefoneId: messageEcho.whatsappPhoneNumberId,
		whatsappConexaoId,
		whatsappConexaoTelefoneId,
	});

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

	const midiaTipo = messageEcho.messageType;
	const echoMetadados: TChatMessageMetadata = {};
	if (midiaTipo === "FIGURINHA") echoMetadados.whatsappMidia = { animated: messageEcho.stickerAnimated ?? false };
	if (messageEcho.location) echoMetadados.whatsappLocation = messageEcho.location;
	if (messageEcho.contacts && messageEcho.contacts.length > 0) echoMetadados.whatsappContacts = messageEcho.contacts;
	if (messageEcho.context) {
		echoMetadados.whatsappContext = messageEcho.context;
		if (messageEcho.context.quotedWhatsappMessageId) {
			echoMetadados.quotedMessage = await resolveQuotedMessageByWhatsappId({
				organizacaoId,
				whatsappMessageId: messageEcho.context.quotedWhatsappMessageId,
			});
		}
	}

	// O echo marca o atendimento como EXTERNO ("atendido pelo telefone") — mas apenas se
	// nenhum humano do hub já for o dono, o que markChatAttendedExternally garante.
	const insertedEcho = await persistOutboundNonHubMessage({
		organizacaoId,
		chatId,
		clienteId: clientId,
		origem: "WHATSAPP_ECHO",
		whatsappMessageId: messageEcho.whatsappMessageId,
		conteudoTexto: messageEcho.textContent || messageEcho.caption || null,
		conteudoMidiaTipo: midiaTipo,
		midia: mediaData ? { ...mediaData, whatsappMediaId: messageEcho.mediaId } : null,
		metadados: Object.keys(echoMetadados).length > 0 ? echoMetadados : null,
		now: new Date(messageEcho.timestamp),
	});
	if (!insertedEcho) {
		console.log("[WHATSAPP_WEBHOOK] [ECHO] Echo duplicado ignorado:", messageEcho.whatsappMessageId);
		return;
	}

	console.log("[WHATSAPP_WEBHOOK] [ECHO] Message echo created to:", messageEcho.toPhoneNumber);
}

import { observeWhatsappPayment } from "@/lib/onboarding/whatsapp-payment";
import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";

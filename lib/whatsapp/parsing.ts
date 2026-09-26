import { STICKER_MIME_TYPE } from "@/lib/chats/sticker";
import type { TWhatsappReferral } from "@/schemas/chats";
import type { TChatMessageContentTypeEnum } from "@/schemas/enums";
import { formatWhatsappIdAsPhone } from "./utils";

type WhatsAppMessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

type AppMessageStatus = "ENVIADO" | "RECEBIDO" | "LIDO";
export type AppWhatsappStatus = "PENDENTE" | "ENVIADO" | "ENTREGUE" | "LIDO" | "FALHOU";

type StatusUpdateResult = {
	status: AppMessageStatus;
	whatsappStatus: AppWhatsappStatus;
};

export function mapWhatsAppStatusToAppStatus(whatsappStatus: WhatsAppMessageStatus): StatusUpdateResult {
	switch (whatsappStatus) {
		case "pending":
			return {
				status: "ENVIADO",
				whatsappStatus: "PENDENTE",
			};
		case "sent":
			return {
				status: "ENVIADO",
				whatsappStatus: "ENVIADO",
			};
		case "delivered":
			return {
				status: "RECEBIDO",
				whatsappStatus: "ENTREGUE",
			};
		case "read":
			return {
				status: "LIDO",
				whatsappStatus: "LIDO",
			};
		case "failed":
			return {
				status: "ENVIADO",
				whatsappStatus: "FALHOU",
			};
		default:
			return {
				status: "ENVIADO",
				whatsappStatus: "PENDENTE",
			};
	}
}
type ParsedStatusUpdate = {
	whatsappMessageId: string;
	whatsappPhoneNumberId?: string;
	status: WhatsAppMessageStatus;
	timestamp: number;
	errorMessage?: string;
	errors?: ParsedWhatsappStatusError[];
};

export type ParsedWhatsappStatusError = {
	code?: number;
	title?: string;
	message?: string;
	details?: string;
};

const WHATSAPP_STATUS_ERROR_MESSAGES: Record<number, string> = {
	4: "Limite temporário de chamadas à API do WhatsApp atingido. Tente novamente mais tarde.",
	10: "Permissão insuficiente para enviar a mensagem pelo WhatsApp.",
	100: "A mensagem foi recusada por parâmetro inválido na requisição ao WhatsApp.",
	368: "A conta ou número do WhatsApp foi temporariamente bloqueado por política da Meta.",
	130429: "Limite de envio do WhatsApp atingido. Tente novamente mais tarde.",
	131000: "Erro temporário do WhatsApp ao processar a mensagem.",
	131005: "Acesso negado ao recurso do WhatsApp usado para enviar a mensagem.",
	131008: "A mensagem foi recusada por falta de um parâmetro obrigatório.",
	131009: "A mensagem foi recusada por parâmetro inválido.",
	131016: "Serviço do WhatsApp temporariamente indisponível.",
	131021: "O número de destino não pode ser o mesmo número da empresa.",
	131026:
		"Mensagem não entregue pelo WhatsApp. O número pode não ter WhatsApp, estar indisponível, ter bloqueado a empresa, usar uma versão antiga do app ou a Meta pode ter bloqueado a entrega por qualidade.",
	131031: "Conta do WhatsApp Business bloqueada ou restrita pela Meta.",
	131042: "Mensagem não enviada por problema de elegibilidade ou pagamento da conta WhatsApp Business.",
	131047: "Mensagem fora da janela de atendimento de 24 horas. Use um template aprovado para retomar contato.",
	131048: "Limite de envio por qualidade/spam atingido. Reduza o volume e revise a qualidade das mensagens.",
	131049: "Mensagem não entregue pela Meta para manter uma experiência saudável para o usuário.",
	131051: "Tipo de mensagem não suportado para este destinatário ou pela Cloud API.",
	131052: "Falha ao baixar a mídia usada na mensagem.",
	131053: "Falha ao enviar a mídia usada na mensagem.",
	131056: "Limite de mensagens para este destinatário atingido. Tente novamente mais tarde.",
	131064: "Mensagem bloqueada por classificação, política ou limite relacionado ao template.",
	132000: "O template foi recusado porque os parâmetros enviados não correspondem ao modelo aprovado.",
	132001: "Template do WhatsApp não encontrado para o idioma ou nome informado.",
	132005: "Texto do template ficou grande demais após preencher os parâmetros.",
	132007: "Template contém caracteres ou conteúdo não permitido pela Meta.",
	132012: "Formato dos parâmetros do template não corresponde ao modelo aprovado.",
	132015: "Template pausado pela Meta por baixa qualidade.",
	132016: "Template desabilitado pela Meta por baixa qualidade.",
	133004: "Servidor do WhatsApp temporariamente indisponível.",
	133006: "Número do WhatsApp precisa ser verificado novamente.",
	133010: "Número do WhatsApp não registrado na Cloud API.",
	133016: "Limite de tentativas de registro do número atingido.",
	135000: "Erro genérico ao processar a mensagem no WhatsApp.",
};

function parseStatusErrors(status: Record<string, unknown>): ParsedWhatsappStatusError[] {
	const errors = status.errors as unknown[] | undefined;
	if (!Array.isArray(errors)) return [];

	return errors
		.map((error) => {
			const errorRecord = error && typeof error === "object" && !Array.isArray(error) ? (error as Record<string, unknown>) : null;
			if (!errorRecord) return null;

			const errorData =
				errorRecord.error_data && typeof errorRecord.error_data === "object" && !Array.isArray(errorRecord.error_data)
					? (errorRecord.error_data as Record<string, unknown>)
					: null;

			return {
				code: typeof errorRecord.code === "number" ? errorRecord.code : undefined,
				title: typeof errorRecord.title === "string" ? errorRecord.title : undefined,
				message: typeof errorRecord.message === "string" ? errorRecord.message : undefined,
				details: typeof errorData?.details === "string" ? errorData.details : undefined,
			};
		})
		.filter((error) => !!error);
}

export function getWhatsappStatusErrorMessage(errors: ParsedWhatsappStatusError[]): string | undefined {
	if (errors.length === 0) return undefined;

	const error = errors[0];
	const mappedMessage = error.code ? WHATSAPP_STATUS_ERROR_MESSAGES[error.code] : undefined;
	if (mappedMessage) return error.code ? `${mappedMessage} (Código ${error.code})` : mappedMessage;

	const fallbackMessage = error.details || error.message || error.title;
	if (!fallbackMessage && !error.code) return "Mensagem não entregue pelo WhatsApp.";
	if (!fallbackMessage) return `Mensagem não entregue pelo WhatsApp. Código ${error.code}.`;
	return error.code ? `${fallbackMessage} (Código ${error.code})` : fallbackMessage;
}

/**
 * Varre todos os entries/changes do payload e devolve os `value` que têm o campo pedido.
 * A Meta agrupa vários itens numa entrega só — ler apenas `entry[0].changes[0]`, como o
 * código antigo fazia, descartava silenciosamente os demais.
 */
function collectWebhookValues(webhookPayload: unknown, options?: { field?: string }): Record<string, unknown>[] {
	const values: Record<string, unknown>[] = [];
	try {
		const payload = webhookPayload as Record<string, unknown>;
		const entries = Array.isArray(payload?.entry) ? (payload.entry as Record<string, unknown>[]) : [];
		for (const entry of entries) {
			const changes = Array.isArray(entry?.changes) ? (entry.changes as Record<string, unknown>[]) : [];
			for (const change of changes) {
				if (options?.field && (change?.field as string | undefined) !== options.field) continue;
				const value = change?.value as Record<string, unknown> | undefined;
				if (value && typeof value === "object") values.push(value);
			}
		}
	} catch (error) {
		console.error("[WHATSAPP_WEBHOOK_PARSE_ERROR]", error);
	}
	return values;
}

function parseSingleStatus(status: Record<string, unknown>): ParsedStatusUpdate | null {
	if (!status?.id) return null;
	const errors = parseStatusErrors(status);
	return {
		whatsappMessageId: status.id as string,
		status: status.status as WhatsAppMessageStatus,
		timestamp: status.timestamp ? Number.parseInt(status.timestamp as string) * 1000 : Date.now(),
		errorMessage: getWhatsappStatusErrorMessage(errors),
		errors,
	};
}

/** Todos os recibos de status do payload — a Meta agrupa enviado/entregue/lido numa entrega só. */
export function parseWebhookStatusUpdates(webhookPayload: unknown): ParsedStatusUpdate[] {
	const parsed: ParsedStatusUpdate[] = [];
	for (const value of collectWebhookValues(webhookPayload)) {
		const statuses = value.statuses as unknown[] | undefined;
		if (!Array.isArray(statuses)) continue;
		for (const rawStatus of statuses) {
			const single = parseSingleStatus(rawStatus as Record<string, unknown>);
			if (single) {
				const metadata = value.metadata as { phone_number_id?: string } | undefined;
				parsed.push({ ...single, whatsappPhoneNumberId: metadata?.phone_number_id });
			}
		}
	}
	return parsed;
}

export function parseStatusUpdate(statusPayload: unknown): ParsedStatusUpdate | null {
	return parseWebhookStatusUpdates(statusPayload)[0] ?? null;
}

/**
 * O que o item do webhook representa: uma mensagem de conversa, uma reação a uma mensagem
 * existente, a edição de uma mensagem existente, uma mensagem de sistema (troca de número) ou
 * um tipo que a Cloud API não renderiza (enquete, gif…).
 */
export type TWhatsappIncomingKind = "message" | "reaction" | "edit" | "system" | "unsupported";

/**
 * Conteúdo de uma mensagem da Cloud API, compartilhado entre a entrada (`messages`) e o eco
 * do app do celular (`smb_message_echoes`) — antes eram dois switches quase idênticos, que
 * divergiam a cada tipo novo.
 */
type TParsedMessageContent = {
	kind: TWhatsappIncomingKind;
	messageType: TChatMessageContentTypeEnum;
	textContent?: string;
	mediaId?: string;
	mimeType?: string;
	filename?: string;
	caption?: string;
	/** Só em figurinhas: webp animado. */
	stickerAnimated?: boolean;
	/** Só em botões de resposta rápida: rótulo e payload. */
	button?: { text: string; payload: string | null };
	/** Só em reações: a mensagem-alvo e o emoji (ausente quando é um "unreact"). */
	reaction?: { targetWhatsappMessageId: string; emoji: string | null };
	/**
	 * Só em edições: a mensagem-alvo e o novo texto. `textContent` também recebe o texto, para
	 * que uma edição cuja original não está na base ainda entre como mensagem legível.
	 */
	edit?: { originalWhatsappMessageId: string; textContent: string };
	/** Só em mensagens de sistema (ex.: troca de número). */
	system?: { type: string; body: string | null; newWaId: string | null };
	/** Só em tipos não suportados: o erro informado pela Meta. */
	unsupported?: { code: number | null; title: string | null; details: string | null };
	/** Só em localização: coordenadas e, quando é um local de negócio, nome/endereço. */
	location?: { latitude: number; longitude: number; name: string | null; address: string | null; url: string | null };
	/** Só em contatos (vCard): os cartões compartilhados. */
	contacts?: Array<{
		formattedName: string | null;
		phones: Array<{ phone: string; waId: string | null; type: string | null }>;
		emails: Array<{ email: string; type: string | null }>;
		org: string | null;
	}>;
};

function parseMessageContent(message: Record<string, unknown>): TParsedMessageContent | null {
	const messageType = message.type as string;

	switch (messageType) {
		case "text": {
			const textObj = message.text as Record<string, unknown> | undefined;
			return { kind: "message", messageType: "TEXTO", textContent: textObj?.body as string | undefined };
		}

		case "image": {
			const imageObj = message.image as Record<string, unknown> | undefined;
			return {
				kind: "message",
				messageType: "IMAGEM",
				mediaId: imageObj?.id as string | undefined,
				mimeType: imageObj?.mime_type as string | undefined,
				caption: imageObj?.caption as string | undefined,
			};
		}

		case "document": {
			const documentObj = message.document as Record<string, unknown> | undefined;
			return {
				kind: "message",
				messageType: "DOCUMENTO",
				mediaId: documentObj?.id as string | undefined,
				mimeType: documentObj?.mime_type as string | undefined,
				filename: documentObj?.filename as string | undefined,
				caption: documentObj?.caption as string | undefined,
			};
		}

		case "audio":
		case "video": {
			const mediaObj = message[messageType] as Record<string, unknown> | undefined;
			return {
				kind: "message",
				messageType: messageType === "audio" ? "AUDIO" : "VIDEO",
				mediaId: mediaObj?.id as string | undefined,
				mimeType: mediaObj?.mime_type as string | undefined,
			};
		}

		// Figurinha é mídia como as demais (webp, baixado por media id), mas nunca tem legenda.
		// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#sticker-messages
		case "sticker": {
			const stickerObj = message.sticker as Record<string, unknown> | undefined;
			return {
				kind: "message",
				messageType: "FIGURINHA",
				mediaId: stickerObj?.id as string | undefined,
				mimeType: (stickerObj?.mime_type as string | undefined) ?? STICKER_MIME_TYPE,
				stickerAnimated: stickerObj?.animated === true,
			};
		}

		// Localização compartilhada: coordenadas sempre, nome/endereço só em locais de negócio.
		case "location": {
			const locationObj = message.location as Record<string, unknown> | undefined;
			const latitude = Number(locationObj?.latitude);
			const longitude = Number(locationObj?.longitude);
			if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
				return { kind: "message", messageType: "TEXTO", textContent: "[Localização recebida — coordenadas inválidas]" };
			}
			const name = (locationObj?.name as string | undefined) ?? null;
			const address = (locationObj?.address as string | undefined) ?? null;
			return {
				kind: "message",
				messageType: "LOCALIZACAO",
				location: { latitude, longitude, name, address, url: (locationObj?.url as string | undefined) ?? null },
				textContent: [name, address].filter(Boolean).join(" — ") || `${latitude}, ${longitude}`,
			};
		}

		// Cartões de contato (vCard). Vira mensagem de texto legível (o contato compartilhado
		// costuma ser um lead) com os dados estruturados guardados na metadata.
		case "contacts": {
			const rawContacts = message.contacts as unknown[] | undefined;
			const parsedContacts: NonNullable<TParsedMessageContent["contacts"]> = (Array.isArray(rawContacts) ? rawContacts : []).map((raw) => {
				const contactObj = raw as Record<string, unknown>;
				const nameObj = contactObj.name as Record<string, unknown> | undefined;
				const orgObj = contactObj.org as Record<string, unknown> | undefined;
				const rawPhones = (contactObj.phones as unknown[] | undefined) ?? [];
				const rawEmails = (contactObj.emails as unknown[] | undefined) ?? [];
				return {
					formattedName: (nameObj?.formatted_name as string | undefined) ?? null,
					phones: rawPhones.map((phone) => {
						const phoneObj = phone as Record<string, unknown>;
						return {
							phone: (phoneObj.phone as string | undefined) ?? "",
							waId: (phoneObj.wa_id as string | undefined) ?? null,
							type: (phoneObj.type as string | undefined) ?? null,
						};
					}),
					emails: rawEmails.map((email) => {
						const emailObj = email as Record<string, unknown>;
						return { email: (emailObj.email as string | undefined) ?? "", type: (emailObj.type as string | undefined) ?? null };
					}),
					org: (orgObj?.company as string | undefined) ?? null,
				};
			});
			const summaryLines = parsedContacts.map((contact) => {
				const parts = [contact.formattedName ?? "Contato"];
				const firstPhone = contact.phones.find((phone) => phone.phone)?.phone;
				if (firstPhone) parts.push(firstPhone);
				return parts.join(" · ");
			});
			return {
				kind: "message",
				messageType: "TEXTO",
				contacts: parsedContacts,
				textContent: summaryLines.length > 0 ? `Contato compartilhado:\n${summaryLines.join("\n")}` : "Contato compartilhado.",
			};
		}

		// Resposta a um botão de resposta rápida de template: o cliente respondeu tocando o
		// botão. Vira uma mensagem de texto com o rótulo, como se ele tivesse digitado, e o
		// payload fica na metadata.
		case "button": {
			const buttonObj = message.button as Record<string, unknown> | undefined;
			const buttonText = (buttonObj?.text as string | undefined) ?? "";
			return {
				kind: "message",
				messageType: "TEXTO",
				textContent: buttonText,
				button: { text: buttonText, payload: (buttonObj?.payload as string | undefined) ?? null },
			};
		}

		// Resposta a uma mensagem interativa (botões ou lista): o cliente tocou numa opção. Mesmo
		// tratamento do botão de template — o rótulo vira o texto e o id da opção vai no payload.
		case "interactive": {
			const interactiveObj = message.interactive as Record<string, unknown> | undefined;
			const interactiveType = interactiveObj?.type as string | undefined;
			const reply = (interactiveType ? interactiveObj?.[interactiveType] : undefined) as Record<string, unknown> | undefined;
			const replyTitle = reply?.title as string | undefined;
			if (!replyTitle) break;
			const replyDescription = reply?.description as string | undefined;
			return {
				kind: "message",
				messageType: "TEXTO",
				textContent: replyDescription ? `${replyTitle}\n${replyDescription}` : replyTitle,
				button: { text: replyTitle, payload: (reply?.id as string | undefined) ?? null },
			};
		}

		// O cliente abriu a conversa (anúncio com mensagem de boas-vindas, busca de empresas) sem
		// escrever nada: a Meta avisa para a loja dar as boas-vindas. Entra como mensagem do cliente
		// para criar o chat, guardar o referral e acionar o agente, com um texto honesto.
		case "request_welcome":
			return { kind: "message", messageType: "TEXTO", textContent: "Cliente abriu a conversa." };

		// Reação a uma mensagem existente. Não é uma mensagem de conversa: anexa o emoji na
		// mensagem-alvo. Um "unreact" chega sem `emoji`.
		case "reaction": {
			const reactionObj = message.reaction as Record<string, unknown> | undefined;
			const targetWhatsappMessageId = reactionObj?.message_id as string | undefined;
			if (!targetWhatsappMessageId) return null;
			return {
				kind: "reaction",
				messageType: "TEXTO",
				reaction: { targetWhatsappMessageId, emoji: (reactionObj?.emoji as string | undefined) ?? null },
			};
		}

		// Edição de uma mensagem já enviada — pelo cliente ou pelo app do celular da loja. O
		// payload traz a mensagem nova inteira em "edit.message", no mesmo formato de uma entrada.
		// Sem alvo ou sem texto, cai no placeholder: não há o que aplicar.
		case "edit": {
			const editObj = message.edit as Record<string, unknown> | undefined;
			const originalWhatsappMessageId = editObj?.original_message_id as string | undefined;
			const editedMessage = editObj?.message as Record<string, unknown> | undefined;
			const editedContent = editedMessage ? parseMessageContent(editedMessage) : null;
			const textContent = editedContent?.textContent || editedContent?.caption;
			if (!originalWhatsappMessageId || !textContent) break;
			return { kind: "edit", messageType: "TEXTO", textContent, edit: { originalWhatsappMessageId, textContent } };
		}

		// Mensagem de sistema — ex.: troca de número do cliente. Registrada sem criar mensagem.
		case "system": {
			const systemObj = message.system as Record<string, unknown> | undefined;
			return {
				kind: "system",
				messageType: "TEXTO",
				system: {
					type: (systemObj?.type as string | undefined) ?? "",
					body: (systemObj?.body as string | undefined) ?? null,
					newWaId: ((systemObj?.wa_id ?? systemObj?.new_wa_id) as string | undefined) ?? null,
				},
			};
		}

		// Tipo que a Cloud API não renderiza (enquete, edição, gif…). Vira uma nota honesta,
		// com o erro informado, em vez de um placeholder que finge ser um tipo desconhecido.
		case "unsupported": {
			const errors = message.errors as unknown[] | undefined;
			const error = (Array.isArray(errors) ? errors[0] : undefined) as Record<string, unknown> | undefined;
			const errorData = error?.error_data as Record<string, unknown> | undefined;
			return {
				kind: "unsupported",
				messageType: "TEXTO",
				unsupported: {
					code: typeof error?.code === "number" ? error.code : null,
					title: (error?.title as string | undefined) ?? null,
					details: (errorData?.details as string | undefined) ?? null,
				},
			};
		}

		default:
			break;
	}

	// Tipos ainda sem tratamento próprio viram um placeholder de texto: descartar a mensagem
	// inteira, como antes, perdia o registro da conversa, o incremento de não lidas e a
	// renovação da janela de 24h — para o operador a mensagem nunca existiu.
	console.log("[WHATSAPP_WEBHOOK] Unsupported message type received; persisting placeholder:", messageType);
	return {
		kind: "message",
		messageType: "TEXTO",
		textContent: `[Mensagem do tipo "${messageType}" recebida — conteúdo não suportado]`,
	};
}

/**
 * O `context` de uma mensagem: a que mensagem ela responde (citação) e se foi encaminhada.
 * Encaminhamento chega sem id; citação chega com o wamid e o remetente da original.
 */
export type TWhatsappMessageContextParsed = {
	quotedWhatsappMessageId: string | null;
	quotedFrom: string | null;
	forwarded: boolean;
	frequentlyForwarded: boolean;
};

function parseMessageContextField(message: Record<string, unknown>): TWhatsappMessageContextParsed | undefined {
	const contextObj = message.context as Record<string, unknown> | undefined;
	if (!contextObj || typeof contextObj !== "object") return undefined;
	const quotedWhatsappMessageId = (contextObj.id as string | undefined) ?? null;
	const forwarded = contextObj.forwarded === true;
	const frequentlyForwarded = contextObj.frequently_forwarded === true;
	if (!quotedWhatsappMessageId && !forwarded && !frequentlyForwarded) return undefined;
	return {
		quotedWhatsappMessageId,
		quotedFrom: quotedWhatsappMessageId && contextObj.from ? formatWhatsappIdAsPhone(contextObj.from as string) : null,
		forwarded: forwarded || frequentlyForwarded,
		frequentlyForwarded,
	};
}

/** Referral de anúncio Meta (Click-to-WhatsApp), no shape do `ChatMessageMetadataSchema`. */
function parseMessageReferral(message: Record<string, unknown>): TWhatsappReferral | null {
	const referral = message.referral as Record<string, unknown> | undefined;
	if (!referral || typeof referral !== "object") return null;
	return {
		sourceUrl: (referral.source_url as string | undefined) ?? null,
		sourceType: (referral.source_type as string | undefined) ?? null,
		sourceId: (referral.source_id as string | undefined) ?? null,
		headline: (referral.headline as string | undefined) ?? null,
		body: (referral.body as string | undefined) ?? null,
		mediaType: (referral.media_type as string | undefined) ?? null,
		imageUrl: (referral.image_url as string | undefined) ?? null,
		videoUrl: (referral.video_url as string | undefined) ?? null,
		thumbnailUrl: (referral.thumbnail_url as string | undefined) ?? null,
		ctwaClid: (referral.ctwa_clid as string | undefined) ?? null,
	};
}

type ParsedIncomingMessage = TParsedMessageContent & {
	whatsappPhoneNumberId: string;
	whatsappMessageId: string;
	/** Null quando a Meta omite `from`/`wa_id` (regra de 30 dias, usernames) — o BSUID assume. */
	fromPhoneNumber: string | null;
	/** Business-scoped user ID (`contacts[].user_id` / `messages[].from_user_id`): a chave garantida. */
	whatsappUserId: string | null;
	profileName: string;
	/** O `type` cru da Meta — `messageType` é o enum da aplicação. */
	messageTypeRaw: string;
	referral: TWhatsappReferral | null;
	/** Citação/encaminhamento, quando o cliente responde a uma mensagem ou encaminha uma. */
	context?: TWhatsappMessageContextParsed;
	timestamp: number;
};

function parseSingleIncomingMessage(message: Record<string, unknown>, value: Record<string, unknown>): ParsedIncomingMessage | null {
	if (!message?.id) return null;

	const metadata = value.metadata as Record<string, unknown> | undefined;
	const whatsappPhoneNumberId = metadata?.phone_number_id as string;
	const contacts = value.contacts as unknown[] | undefined;
	const contact = (Array.isArray(contacts) ? contacts[0] : undefined) as Record<string, unknown> | undefined;
	const profile = contact?.profile as Record<string, unknown> | undefined;

	const content = parseMessageContent(message);
	if (!content) return null;
	const from = (message.from as string | undefined) || (contact?.wa_id as string | undefined);

	return {
		...content,
		whatsappPhoneNumberId: whatsappPhoneNumberId || "",
		whatsappMessageId: message.id as string,
		fromPhoneNumber: from ? formatWhatsappIdAsPhone(from) : null,
		whatsappUserId: (contact?.user_id as string | undefined) || (message.from_user_id as string | undefined) || null,
		profileName: (profile?.name as string) || "Cliente",
		messageTypeRaw: message.type as string,
		referral: parseMessageReferral(message),
		context: parseMessageContextField(message),
		timestamp: message.timestamp ? Number.parseInt(message.timestamp as string) * 1000 : Date.now(),
	};
}

/** Todas as mensagens de entrada de todos os entries/changes — entregas em lote da Meta trazem mais de uma. */
export function parseWebhookIncomingMessages(webhookPayload: unknown): ParsedIncomingMessage[] {
	const parsed: ParsedIncomingMessage[] = [];
	for (const value of collectWebhookValues(webhookPayload)) {
		const messages = value.messages as unknown[] | undefined;
		if (!Array.isArray(messages)) continue;
		for (const rawMessage of messages) {
			try {
				const single = parseSingleIncomingMessage(rawMessage as Record<string, unknown>, value);
				if (single) parsed.push(single);
			} catch (error) {
				console.error("[WHATSAPP_MESSAGE_PARSE_ERROR]", error);
			}
		}
	}
	return parsed;
}

export function parseWebhookIncomingMessage(webhookPayload: unknown): ParsedIncomingMessage | null {
	return parseWebhookIncomingMessages(webhookPayload)[0] ?? null;
}

export function isStatusUpdate(webhookPayload: unknown): boolean {
	return collectWebhookValues(webhookPayload).some((value) => Array.isArray(value.statuses) && value.statuses.length > 0);
}

export function isMessageEvent(webhookPayload: unknown): boolean {
	return collectWebhookValues(webhookPayload).some((value) => Array.isArray(value.messages) && value.messages.length > 0);
}

// Template Webhook Event Types
type AppTemplateStatus = "RASCUNHO" | "PENDENTE" | "APROVADO" | "REJEITADO" | "PAUSADO" | "DESABILITADO";
type AppTemplateQuality = "PENDENTE" | "ALTA" | "MEDIA" | "BAIXA";

export function mapWhatsAppTemplateStatusToAppStatus(whatsappStatus: string): AppTemplateStatus {
	switch (whatsappStatus.toUpperCase()) {
		case "APPROVED":
			return "APROVADO";
		case "REJECTED":
			return "REJEITADO";
		case "PENDING":
			return "PENDENTE";
		case "DISABLED":
			return "DESABILITADO";
		case "PAUSED":
			return "PAUSADO";
		default:
			return "PENDENTE";
	}
}

export function mapWhatsAppTemplateQualityToAppQuality(whatsappQuality: string): AppTemplateQuality {
	switch (whatsappQuality.toUpperCase()) {
		case "GREEN":
		case "HIGH":
			return "ALTA";
		case "YELLOW":
		case "MEDIUM":
			return "MEDIA";
		case "RED":
		case "LOW":
			return "BAIXA";
		default:
			return "PENDENTE";
	}
}

type ParsedTemplateStatusUpdate = {
	event: string;
	messageTemplateId: string;
	messageTemplateName: string;
	messageTemplateLanguage: string;
	status?: AppTemplateStatus;
	reason?: string;
	timestamp: number;
};

type ParsedTemplateQualityUpdate = {
	event: string;
	messageTemplateId: string;
	messageTemplateName: string;
	messageTemplateLanguage: string;
	currentLimit?: string;
	quality?: AppTemplateQuality;
	previousQuality?: AppTemplateQuality;
	timestamp: number;
};

type ParsedTemplateCategoryUpdate = {
	event: string;
	messageTemplateId: string;
	messageTemplateName: string;
	messageTemplateLanguage: string;
	category?: string;
	previousCategory?: string;
	timestamp: number;
};

const TEMPLATE_WEBHOOK_FIELDS = ["message_template_status_update", "message_template_quality_update", "template_category_update"];

export function isTemplateEvent(webhookPayload: unknown): boolean {
	try {
		const payload = webhookPayload as Record<string, unknown>;
		const entries = Array.isArray(payload?.entry) ? (payload.entry as Record<string, unknown>[]) : [];
		return entries.some((entry) => {
			const changes = Array.isArray(entry?.changes) ? (entry.changes as Record<string, unknown>[]) : [];
			return changes.some((change) => TEMPLATE_WEBHOOK_FIELDS.includes(change?.field as string));
		});
	} catch {
		return false;
	}
}

export function parseTemplateStatusUpdate(webhookPayload: unknown): ParsedTemplateStatusUpdate | null {
	try {
		const value = collectWebhookValues(webhookPayload, { field: "message_template_status_update" })[0];
		if (!value) return null;

		// A Meta envia message_template_id como número no webhook, mas o idExterno é salvo como string na criação.
		// Normalizamos para string para que o matching com o idExterno salvo funcione.
		const messageTemplateId = value?.message_template_id != null ? String(value.message_template_id) : undefined;
		const messageTemplateName = value?.message_template_name as string | undefined;
		const messageTemplateLanguage = value?.message_template_language as string | undefined;
		const event = value?.event as string | undefined;

		if (!messageTemplateId || !messageTemplateName || !messageTemplateLanguage) {
			console.error("[WHATSAPP_TEMPLATE_STATUS_PARSE_ERROR] Missing required fields");
			return null;
		}

		// Get status and reason if this is an APPROVED or REJECTED event
		let status: AppTemplateStatus | undefined;
		let reason: string | undefined;

		if (event === "APPROVED") {
			status = "APROVADO";
		} else if (event === "REJECTED") {
			status = "REJEITADO";
			reason = value?.reason as string | undefined;
		} else if (event === "DISABLED") {
			status = "DESABILITADO";
			reason = value?.disable_info as string | undefined;
		} else if (event === "PAUSED") {
			status = "PAUSADO";
		}

		return {
			event: event || "UNKNOWN",
			messageTemplateId,
			messageTemplateName,
			messageTemplateLanguage,
			status,
			reason,
			timestamp: Date.now(),
		};
	} catch (error) {
		console.error("[WHATSAPP_TEMPLATE_STATUS_PARSE_ERROR]", error);
		return null;
	}
}

export function parseTemplateQualityUpdate(webhookPayload: unknown): ParsedTemplateQualityUpdate | null {
	try {
		const value = collectWebhookValues(webhookPayload, { field: "message_template_quality_update" })[0];
		if (!value) return null;

		// A Meta envia message_template_id como número no webhook, mas o idExterno é salvo como string na criação.
		// Normalizamos para string para que o matching com o idExterno salvo funcione.
		const messageTemplateId = value?.message_template_id != null ? String(value.message_template_id) : undefined;
		const messageTemplateName = value?.message_template_name as string | undefined;
		const messageTemplateLanguage = value?.message_template_language as string | undefined;
		const event = value?.event as string | undefined;

		if (!messageTemplateId || !messageTemplateName || !messageTemplateLanguage) {
			console.error("[WHATSAPP_TEMPLATE_QUALITY_PARSE_ERROR] Missing required fields");
			return null;
		}

		const currentLimit = value?.current_limit as string | undefined;
		const previousQualityRaw = value?.previous_quality as string | undefined;
		const newQualityRaw = value?.new_quality as string | undefined;

		const quality = newQualityRaw ? mapWhatsAppTemplateQualityToAppQuality(newQualityRaw) : undefined;
		const previousQuality = previousQualityRaw ? mapWhatsAppTemplateQualityToAppQuality(previousQualityRaw) : undefined;

		return {
			event: event || "QUALITY_UPDATE",
			messageTemplateId,
			messageTemplateName,
			messageTemplateLanguage,
			currentLimit,
			quality,
			previousQuality,
			timestamp: Date.now(),
		};
	} catch (error) {
		console.error("[WHATSAPP_TEMPLATE_QUALITY_PARSE_ERROR]", error);
		return null;
	}
}

export function parseTemplateCategoryUpdate(webhookPayload: unknown): ParsedTemplateCategoryUpdate | null {
	try {
		const value = collectWebhookValues(webhookPayload, { field: "template_category_update" })[0];
		if (!value) return null;

		// A Meta envia message_template_id como número no webhook, mas o idExterno é salvo como string na criação.
		// Normalizamos para string para que o matching com o idExterno salvo funcione.
		const messageTemplateId = value?.message_template_id != null ? String(value.message_template_id) : undefined;
		const messageTemplateName = value?.message_template_name as string | undefined;
		const messageTemplateLanguage = value?.message_template_language as string | undefined;
		const event = value?.event as string | undefined;

		if (!messageTemplateId || !messageTemplateName || !messageTemplateLanguage) {
			console.error("[WHATSAPP_TEMPLATE_CATEGORY_PARSE_ERROR] Missing required fields");
			return null;
		}

		const category = value?.category as string | undefined;
		const previousCategory = value?.previous_category as string | undefined;

		return {
			event: event || "CATEGORY_UPDATE",
			messageTemplateId,
			messageTemplateName,
			messageTemplateLanguage,
			category,
			previousCategory,
			timestamp: Date.now(),
		};
	} catch (error) {
		console.error("[WHATSAPP_TEMPLATE_CATEGORY_PARSE_ERROR]", error);
		return null;
	}
}

// SMB Message Echoes (WhatsApp Coexistence)
// These are messages sent from the WhatsApp Business phone app that are echoed to the webhook
type ParsedMessageEcho = TParsedMessageContent & {
	whatsappPhoneNumberId: string;
	whatsappMessageId: string;
	fromPhoneNumber: string | null; // Business phone number (sender)
	/** Null quando a Meta omite `to` — o BSUID do destinatário assume. */
	toPhoneNumber: string | null; // Client phone number (recipient)
	/** Business-scoped user ID do destinatário (`message.to_user_id`), quando presente. */
	toUserId: string | null;
	/** O `type` cru da Meta — `messageType` é o enum da aplicação. */
	messageTypeRaw: string;
	/** Citação/encaminhamento, quando o eco responde a uma mensagem. */
	context?: TWhatsappMessageContextParsed;
	timestamp: number;
};

export function isMessageEchoEvent(webhookPayload: unknown): boolean {
	return collectWebhookValues(webhookPayload, { field: "smb_message_echoes" }).some(
		(value) => Array.isArray(value.message_echoes) && value.message_echoes.length > 0,
	);
}

function parseSingleEcho(message: Record<string, unknown>, value: Record<string, unknown>): ParsedMessageEcho | null {
	if (!message?.id) return null;

	const metadata = value.metadata as Record<string, unknown> | undefined;
	const whatsappPhoneNumberId = metadata?.phone_number_id as string;

	const content = parseMessageContent(message);
	// Sistema/não-suportado ecoados pelo app do celular não têm conteúdo para espelhar. Reação e
	// edição seguem: vão para a mensagem-alvo, como as do cliente.
	if (!content || content.kind === "system" || content.kind === "unsupported") {
		if (content) console.log("[WHATSAPP_WEBHOOK] Ignoring non-message echo kind:", content.kind);
		return null;
	}
	const from = message.from as string | undefined;
	const to = message.to as string | undefined;

	return {
		...content,
		whatsappPhoneNumberId: whatsappPhoneNumberId || "",
		whatsappMessageId: message.id as string,
		fromPhoneNumber: from ? formatWhatsappIdAsPhone(from) : null,
		toPhoneNumber: to ? formatWhatsappIdAsPhone(to) : null,
		toUserId: (message.to_user_id as string | undefined) || null,
		messageTypeRaw: message.type as string,
		context: parseMessageContextField(message),
		timestamp: message.timestamp ? Number.parseInt(message.timestamp as string) * 1000 : Date.now(),
	};
}

/** Todos os ecos do app do celular — antes só o primeiro era lido, perdendo ecos em entregas agrupadas. */
export function parseWebhookMessageEchoes(webhookPayload: unknown): ParsedMessageEcho[] {
	const parsed: ParsedMessageEcho[] = [];
	for (const value of collectWebhookValues(webhookPayload, { field: "smb_message_echoes" })) {
		const messageEchoes = value.message_echoes as unknown[] | undefined;
		if (!Array.isArray(messageEchoes)) continue;
		for (const rawEcho of messageEchoes) {
			try {
				const single = parseSingleEcho(rawEcho as Record<string, unknown>, value);
				if (single) parsed.push(single);
			} catch (error) {
				console.error("[WHATSAPP_MESSAGE_ECHO_PARSE_ERROR]", error);
			}
		}
	}
	return parsed;
}

export function parseWebhookMessageEcho(webhookPayload: unknown): ParsedMessageEcho | null {
	return parseWebhookMessageEchoes(webhookPayload)[0] ?? null;
}

import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TChatMessageAuthorTypeEnum, TChatMessageContentTypeEnum } from "@/schemas/enums";

export type TQuotedMessageSnapshot = NonNullable<TChatMessageMetadata["quotedMessage"]>;

/** Quantos caracteres da mensagem citada guardamos no snapshot — o painel mostra duas linhas. */
export const QUOTED_TEXT_MAX_LENGTH = 200;

export function truncateQuotedText(value: string | null | undefined): string | null {
	const normalized = value?.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	if (normalized.length <= QUOTED_TEXT_MAX_LENGTH) return normalized;
	return `${normalized.slice(0, QUOTED_TEXT_MAX_LENGTH - 1)}…`;
}

export type TQuotableMessage = {
	id: string;
	autorTipo: TChatMessageAuthorTypeEnum;
	autorUsuario?: { nome: string | null } | null;
	conteudoTexto: string | null;
	conteudoMidiaTipo: TChatMessageContentTypeEnum;
	conteudoMidiaUrl: string | null;
	conteudoMidiaArquivoNome: string | null;
	whatsappMessageId: string | null;
};

/**
 * Snapshot da mensagem citada, guardado na mensagem que responde. Como no WhatsApp, o painel
 * de citação continua legível mesmo que a original saia do histórico carregado ou seja apagada;
 * o `chatMessageId` serve para pular até ela quando estiver na tela.
 */
export function buildQuotedMessageSnapshot(message: TQuotableMessage): TQuotedMessageSnapshot {
	return {
		chatMessageId: message.id,
		providerMessageId: message.whatsappMessageId,
		authorType: message.autorTipo,
		authorName: message.autorTipo === "USUÁRIO" ? (message.autorUsuario?.nome ?? null) : null,
		text: truncateQuotedText(message.conteudoTexto),
		mediaType: message.conteudoMidiaTipo,
		mediaUrl: message.conteudoMidiaTipo === "IMAGEM" || message.conteudoMidiaTipo === "FIGURINHA" ? message.conteudoMidiaUrl : null,
		fileName: message.conteudoMidiaArquivoNome,
	};
}

/** Citação cuja original não está na base (enviada antes da conexão, ou fora do hub). */
export function buildUnavailableQuotedMessage(providerMessageId: string): TQuotedMessageSnapshot {
	return {
		chatMessageId: null,
		providerMessageId,
		authorType: null,
		authorName: null,
		text: null,
		mediaType: null,
		mediaUrl: null,
		fileName: null,
	};
}

/** Rótulo curto do que a mensagem citada carrega, quando não há texto (Foto, Mensagem de voz…). */
export function describeQuotedMedia(quote: Pick<TQuotedMessageSnapshot, "mediaType" | "fileName">): string | null {
	switch (quote.mediaType) {
		case "IMAGEM":
			return "Foto";
		case "VIDEO":
			return "Vídeo";
		case "AUDIO":
			return "Mensagem de voz";
		case "DOCUMENTO":
			return quote.fileName?.trim() || "Documento";
		case "FIGURINHA":
			return "Figurinha";
		case "LOCALIZACAO":
			return "Localização";
		default:
			return null;
	}
}

import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TChatMessageContentTypeEnum } from "@/schemas/enums";

/**
 * Regras de encaminhamento de mensagens do hub, compartilhadas entre a bolha (que decide se
 * oferece "Encaminhar") e a rota (que revalida).
 *
 * Encaminha-se o que pode ser reenviado como mensagem livre: texto e os quatro tipos de mídia que
 * o envio do hub já sabe despachar. Figurinha e localização ficam de fora — o envio não tem
 * caminho para elas — e uma mensagem não suportada pela Cloud API não tem conteúdo a reenviar.
 */
export const FORWARDABLE_MEDIA_TYPES = ["IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"] as const;
export type TForwardableMediaType = (typeof FORWARDABLE_MEDIA_TYPES)[number];

/** Limite de destinos por encaminhamento, o mesmo no diálogo e na rota. */
export const FORWARD_MAX_TARGETS = 5;

export function isForwardableMediaType(tipo: TChatMessageContentTypeEnum): tipo is TForwardableMediaType {
	return (FORWARDABLE_MEDIA_TYPES as readonly string[]).includes(tipo);
}

export function canForwardMessage(message: {
	conteudoTexto: string | null;
	conteudoMidiaTipo: TChatMessageContentTypeEnum;
	metadados: TChatMessageMetadata | null;
}) {
	if (message.metadados?.whatsappUnsupported) return false;
	if (message.conteudoMidiaTipo === "TEXTO") return !!message.conteudoTexto?.trim();
	return isForwardableMediaType(message.conteudoMidiaTipo);
}

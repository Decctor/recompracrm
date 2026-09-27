import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { getSurveyButtons } from "@/lib/message-templates/surveys";
import type { SendMessageQuickReplyButton } from "@/lib/whatsapp/internal-gateway";

/**
 * Payload dos botões de pesquisa (docs/dev-planning/survey-campaigns-plan.md §5.1).
 *
 * A Meta aceita um payload por botão de resposta rápida a cada envio e o devolve no toque. Levamos a
 * interação (o envio) e a opção: a resposta chega sabendo exatamente a que mensagem responde, sem
 * casar texto nem adivinhar entre envios recentes. Formato: `psq:<interactionId>:<opcaoValor>`.
 * 4 + 36 + 1 + ≤64 = ≤105 chars, abaixo do limite de 128 da Meta.
 */
export const SURVEY_REPLY_PAYLOAD_PREFIX = "psq:";
export const SURVEY_REPLY_PAYLOAD_MAX_LENGTH = 128;

export type TSurveyReplyPayload = {
	interactionId: string;
	opcaoValor: string;
};

export function buildSurveyReplyPayload({ interactionId, opcaoValor }: TSurveyReplyPayload) {
	return `${SURVEY_REPLY_PAYLOAD_PREFIX}${interactionId}:${opcaoValor}`;
}

/** Null para qualquer payload que não seja nosso: nada mais na plataforma emite o prefixo `psq:`. */
export function parseSurveyReplyPayload(payload: string | null | undefined): TSurveyReplyPayload | null {
	if (!payload || !payload.startsWith(SURVEY_REPLY_PAYLOAD_PREFIX)) return null;
	const rest = payload.slice(SURVEY_REPLY_PAYLOAD_PREFIX.length);
	const separatorIndex = rest.indexOf(":");
	if (separatorIndex <= 0) return null;
	const interactionId = rest.slice(0, separatorIndex);
	const opcaoValor = rest.slice(separatorIndex + 1);
	if (!interactionId || !opcaoValor) return null;
	return { interactionId, opcaoValor };
}

/**
 * Botões para o gateway interno, que não fala o formato de template da Meta: os mesmos rótulos, com
 * o payload como id. O webhook do gateway não devolve o id (só o texto), mas mandar os botões custa
 * nada e é o que permite o fallback por texto na captura.
 */
export function buildSurveyGatewayButtons({
	content,
	interactionId,
}: {
	content: Pick<TMessageTemplateContent, "botoes">;
	interactionId: string;
}): SendMessageQuickReplyButton[] {
	return getSurveyButtons(content).map((button) => ({
		type: "quick_reply",
		text: button.texto,
		id: buildSurveyReplyPayload({ interactionId, opcaoValor: button.opcaoValor }),
	}));
}

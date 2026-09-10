import type { TAiAgentTurnAttachment } from "@/schemas/ai-agents";
import type { TAiAgentAttachmentTypeEnum } from "@/schemas/enums";

/**
 * Normalização do anexo produzido pelo turno.
 *
 * A URL chega como string livre no schema de saída **de propósito**: um `z.string().url()` ali
 * transformaria um link torto numa falha de saída estruturada, que custa uma regeração inteira
 * do turno. Aqui um anexo inválido simplesmente vira `null` e o cliente recebe a mensagem em
 * texto — o mesmo degradê que a entrega aplica quando o provedor recusa a mídia.
 *
 * Só `https` passa: a Meta busca o link por conta própria e recusa origem sem TLS.
 */
export function normalizeTurnAttachment(attachment: TAiAgentTurnAttachment | null | undefined): TAiAgentTurnAttachment | null {
	if (!attachment) return null;

	const url = attachment.url?.trim();
	if (!url) return null;

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		console.warn("[AI_AGENT] [ANEXO] URL inválida descartada:", url);
		return null;
	}
	if (parsed.protocol !== "https:") {
		console.warn("[AI_AGENT] [ANEXO] URL sem https descartada:", url);
		return null;
	}

	const nomeArquivo = attachment.nomeArquivo?.trim();
	return { url: parsed.toString(), tipo: attachment.tipo, nomeArquivo: nomeArquivo || null };
}

/** Nome do tipo de mídia no WhatsApp — vale tanto para a Meta quanto para o gateway interno. */
export function toProviderMediaType(tipo: TAiAgentAttachmentTypeEnum): "image" | "video" | "document" {
	if (tipo === "IMAGEM") return "image";
	if (tipo === "VIDEO") return "video";
	return "document";
}

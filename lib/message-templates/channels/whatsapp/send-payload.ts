import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { buildSurveyReplyPayload } from "@/lib/campaigns/surveys/payload";
import { getMessageTemplateButtonPreset } from "../../buttons/presets";
import { formatPhoneAsWhatsappId, sanitizeMessageTemplateParameter } from "../../formatting";
import type { TMessageTemplateEntityLike, TMessageTemplateRuntimeContext } from "../../types";
import type { TWhatsappTemplateSendComponent, TWhatsappTemplateSendParameter, TWhatsappTemplateSendPayload } from "./types";

type BuildWhatsappTemplateSendPayloadParams = {
	template: TMessageTemplateEntityLike;
	toPhoneNumber: string;
	runtimeContext: TMessageTemplateRuntimeContext;
};

function buildHeaderSendComponent(content: TMessageTemplateContent, runtimeContext: TMessageTemplateRuntimeContext): TWhatsappTemplateSendComponent | null {
	const header = content.cabecalho;
	if (!header || header.tipo === "NENHUM" || header.tipo === "TEXTO") return null;

	const mediaUrl = header.tipo === "IMAGEM_DINAMICA" ? runtimeContext.cabecalhoMidiaUrl : header.conteudoMidiaUrl;
	if (!mediaUrl) return null;

	let parameter: TWhatsappTemplateSendParameter | null = null;
	if (header.tipo === "IMAGEM" || header.tipo === "IMAGEM_DINAMICA") {
		parameter = { type: "image", image: { link: mediaUrl } };
	}
	if (header.tipo === "VIDEO") {
		parameter = { type: "video", video: { link: mediaUrl } };
	}
	if (header.tipo === "DOCUMENTO") {
		parameter = { type: "document", document: { link: mediaUrl } };
	}
	if (!parameter) return null;

	return {
		type: "header",
		parameters: [parameter],
	};
}

function buildBodySendComponent(content: TMessageTemplateContent, runtimeContext: TMessageTemplateRuntimeContext): TWhatsappTemplateSendComponent | null {
	if (content.corpo.parametros.length === 0) return null;

	return {
		type: "body",
		parameters: content.corpo.parametros.map((parameter) => ({
			type: "text",
			text: sanitizeMessageTemplateParameter(runtimeContext.variaveis[parameter.identificadorInterno] ?? parameter.exemplo),
		})),
	};
}

function buildButtonSendComponents(content: TMessageTemplateContent, runtimeContext: TMessageTemplateRuntimeContext): TWhatsappTemplateSendComponent[] {
	const components: TWhatsappTemplateSendComponent[] = [];

	for (const [index, button] of content.botoes.entries()) {
		// Botão de pesquisa: o payload leva a interação e a opção, e volta intacto no toque do cliente.
		// Sem interação (preview sem envio) o botão sai sem payload e a captura cai no fallback do wamid.
		if (button.tipo === "RESPOSTA_PESQUISA") {
			if (!runtimeContext.interactionId) continue;
			components.push({
				type: "button",
				sub_type: "quick_reply",
				index: String(index),
				parameters: [{ type: "payload", payload: buildSurveyReplyPayload({ interactionId: runtimeContext.interactionId, opcaoValor: button.opcaoValor }) }],
			});
			continue;
		}

		if (button.tipo !== "URL_PRESET") continue;
		const preset = getMessageTemplateButtonPreset(button.preset);
		if (!preset) continue;

		const clientId = runtimeContext.clienteId ?? "";
		components.push({
			type: "button",
			sub_type: "url",
			index: String(index),
			parameters: [
				{
					type: "text",
					text: sanitizeMessageTemplateParameter(clientId),
				},
			],
		});
	}

	return components;
}

export function buildWhatsappTemplateSendPayload({
	template,
	toPhoneNumber,
	runtimeContext,
}: BuildWhatsappTemplateSendPayloadParams): TWhatsappTemplateSendPayload {
	const components = [
		buildHeaderSendComponent(template.conteudo, runtimeContext),
		buildBodySendComponent(template.conteudo, runtimeContext),
		...buildButtonSendComponents(template.conteudo, runtimeContext),
	].filter((component): component is TWhatsappTemplateSendComponent => Boolean(component));

	return {
		messaging_product: "whatsapp",
		to: formatPhoneAsWhatsappId(toPhoneNumber),
		type: "template",
		template: {
			name: template.nome,
			language: { code: template.linguagem },
			components: components.length > 0 ? components : undefined,
		},
	};
}

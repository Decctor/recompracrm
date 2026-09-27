import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { getDefaultAppOrigin, getMessageTemplateButtonPreset } from "../../buttons/presets";
import { convertHtmlToWhatsappText } from "../../formatting";
import { convertInternalVariablesToPositional } from "../../parsing";
import { MESSAGE_TEMPLATE_HEADER_TO_META_FORMAT } from "./meta-maps";
import type { TMetaTemplateButton, TMetaTemplateComponent } from "./types";

type BuildMetaTemplateComponentsParams = {
	content: TMessageTemplateContent;
	origin?: string;
	organizationId: string;
};

function getHeaderHandle(content: TMessageTemplateContent) {
	return content.cabecalho?.conteudoMidiaHandle ?? null;
}

export function buildWhatsappMetaHeaderComponent(params: BuildMetaTemplateComponentsParams): TMetaTemplateComponent | null {
	const header = params.content.cabecalho;
	if (!header || header.tipo === "NENHUM") return null;

	const format = MESSAGE_TEMPLATE_HEADER_TO_META_FORMAT[header.tipo];
	if (!format) return null;

	if (header.tipo === "TEXTO") {
		return {
			type: "HEADER",
			format,
			text: header.conteudoTexto ?? "",
			example: header.conteudoTexto ? { header_text: [header.conteudoTexto] } : undefined,
		};
	}

	const headerHandle = getHeaderHandle(params.content);
	return {
		type: "HEADER",
		format,
		example: {
			header_handle: headerHandle ? [headerHandle] : [],
		},
	};
}

export function buildWhatsappMetaBodyComponent(content: TMessageTemplateContent): TMetaTemplateComponent {
	const parameters = content.corpo.parametros;
	const text = convertInternalVariablesToPositional(convertHtmlToWhatsappText(content.corpo.conteudo), parameters);
	const component: TMetaTemplateComponent = {
		type: "BODY",
		text,
	};

	if (parameters.length > 0) {
		component.example = {
			body_text: [parameters.map((parameter) => parameter.exemplo)],
		};
	}

	return component;
}

export function buildWhatsappMetaFooterComponent(content: TMessageTemplateContent): TMetaTemplateComponent | null {
	if (!content.rodape?.trim()) return null;
	return {
		type: "FOOTER",
		text: content.rodape.trim(),
	};
}

export function buildWhatsappMetaButtonsComponent({ content, origin, organizationId }: BuildMetaTemplateComponentsParams): TMetaTemplateComponent | null {
	const buttons: TMetaTemplateButton[] = [];

	for (const button of content.botoes) {
		// A Meta nunca vê o vínculo campo/opção do botão de pesquisa: para ela é uma resposta rápida.
		if (button.tipo === "RESPOSTA RÁPIDA" || button.tipo === "RESPOSTA_PESQUISA") {
			buttons.push({ type: "QUICK_REPLY", text: button.texto });
			continue;
		}

		if (button.tipo === "URL") {
			buttons.push({ type: "URL", text: button.texto, url: button.url });
			continue;
		}

		if (button.tipo === "URL_PRESET") {
			const preset = getMessageTemplateButtonPreset(button.preset);
			if (!preset) continue;
			buttons.push({
				type: "URL",
				text: button.texto,
				url: preset.buildWhatsappTemplateUrl({ origin: origin ?? getDefaultAppOrigin(), orgId: organizationId }),
				example: [button.exemplo || preset.resolveWhatsappParameterExample()],
			});
			continue;
		}

		if (button.tipo === "TELEFONE") {
			buttons.push({ type: "PHONE_NUMBER", text: button.texto, phone_number: button.telefone });
		}
	}

	if (buttons.length === 0) return null;
	return {
		type: "BUTTONS",
		buttons,
	};
}

export function buildWhatsappMetaTemplateComponents(params: BuildMetaTemplateComponentsParams): TMetaTemplateComponent[] {
	return [
		buildWhatsappMetaHeaderComponent(params),
		buildWhatsappMetaBodyComponent(params.content),
		buildWhatsappMetaFooterComponent(params.content),
		buildWhatsappMetaButtonsComponent(params),
	].filter((component): component is TMetaTemplateComponent => Boolean(component));
}

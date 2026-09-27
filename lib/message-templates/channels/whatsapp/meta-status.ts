import type { TMessageTemplateContent, TMessageTemplateMetadata } from "@/schemas/message-templates";
import type { TMessageTemplateCategory, TMessageTemplatePhoneMetadata } from "../../types";
import { META_CATEGORY_TO_MESSAGE_TEMPLATE, mapMetaQualityToMessageTemplateQuality, mapMetaStatusToMessageTemplateStatus } from "./meta-maps";
import type { TMetaTemplate, TMetaTemplateButton, TMetaTemplateComponent } from "./types";
import { buildMessageTemplateMentionSpan, extractOrderedMessageTemplatePositions } from "../../parsing";
import { getDefaultMessageTemplateVariableExample } from "../../variables";

export function extractWhatsappTemplatePhoneMetadataFromMeta(metaTemplate: TMetaTemplate): TMessageTemplatePhoneMetadata {
	return {
		idExterno: metaTemplate.id,
		status: mapMetaStatusToMessageTemplateStatus(metaTemplate.status),
		qualidade: mapMetaQualityToMessageTemplateQuality(metaTemplate.quality_score?.score),
	};
}

export function buildWhatsappMetadataPatchFromMeta({
	currentMetadata,
	connectionId,
	metaTemplate,
}: {
	currentMetadata: TMessageTemplateMetadata;
	connectionId: string;
	metaTemplate: TMetaTemplate;
}): TMessageTemplateMetadata {
	return {
		...currentMetadata,
		porNumeroTelefone: {
			...currentMetadata.porNumeroTelefone,
			[connectionId]: extractWhatsappTemplatePhoneMetadataFromMeta(metaTemplate),
		},
	};
}

export function extractWhatsappCategoryFromMeta(metaTemplate: TMetaTemplate): TMessageTemplateCategory {
	return META_CATEGORY_TO_MESSAGE_TEMPLATE[metaTemplate.category] ?? "UTILIDADE";
}

export type TWhatsappContentFromMetaResult = {
	content: TMessageTemplateContent;
	alerts: string[];
};

export function extractWhatsappContentFromMeta(metaTemplate: TMetaTemplate): TMessageTemplateContent {
	return extractWhatsappContentFromMetaWithLocalContext({ metaTemplate, currentContent: null }).content;
}

export function extractWhatsappContentFromMetaWithLocalContext({
	metaTemplate,
	currentContent,
}: {
	metaTemplate: TMetaTemplate;
	currentContent?: TMessageTemplateContent | null;
}): TWhatsappContentFromMetaResult {
	const content: TMessageTemplateContent = {
		assunto: currentContent?.assunto ?? "",
		preheader: currentContent?.preheader ?? "",
		cabecalho: null,
		corpo: {
			conteudo: "",
			parametros: [],
		},
		rodape: null,
		botoes: [],
	};
	const alerts: string[] = [];

	for (const component of metaTemplate.components) {
		if (component.type === "HEADER") content.cabecalho = mergeHeaderFromMetaComponent(component, currentContent?.cabecalho ?? null);
		if (component.type === "BODY") {
			if (currentContent) {
				const bodyResult = extractBodyFromMetaComponent(component, currentContent.corpo);
				content.corpo = bodyResult.corpo;
				alerts.push(...bodyResult.alerts);
			} else {
				content.corpo = extractLegacyBodyFromMetaComponent(component);
			}
		}
		if (component.type === "FOOTER") content.rodape = component.text ?? null;
		if (component.type === "BUTTONS") content.botoes = extractButtonsFromMetaComponent(component, currentContent?.botoes ?? null);
	}

	if (!content.corpo.conteudo && currentContent?.corpo) content.corpo = currentContent.corpo;
	if (!content.cabecalho && currentContent?.cabecalho && hasLocalHeaderMedia(currentContent.cabecalho)) content.cabecalho = currentContent.cabecalho;

	return { content, alerts };
}

function extractHeaderFromMetaComponent(component: TMetaTemplateComponent): TMessageTemplateContent["cabecalho"] {
	if (component.format === "TEXT") {
		return {
			tipo: "TEXTO",
			conteudoTexto: component.text ?? "",
			conteudoMidiaUrl: null,
			conteudoMidiaHandle: null,
			conteudoLocalizacao: null,
		};
	}

	if (component.format === "IMAGE" || component.format === "VIDEO" || component.format === "DOCUMENT") {
		return {
			tipo: component.format === "IMAGE" ? "IMAGEM" : component.format === "VIDEO" ? "VIDEO" : "DOCUMENTO",
			conteudoTexto: null,
			conteudoMidiaUrl: null,
			conteudoMidiaHandle: component.example?.header_handle?.[0] ?? null,
			conteudoLocalizacao: null,
		};
	}

	return null;
}

function hasLocalHeaderMedia(header: TMessageTemplateContent["cabecalho"]) {
	return Boolean(header?.conteudoMidiaUrl || header?.conteudoMidiaHandle);
}

function mergeHeaderFromMetaComponent(
	component: TMetaTemplateComponent,
	currentHeader: TMessageTemplateContent["cabecalho"],
): TMessageTemplateContent["cabecalho"] {
	const header = extractHeaderFromMetaComponent(component);
	if (!header || !currentHeader) return header;

	return {
		...header,
		conteudoMidiaUrl: currentHeader.conteudoMidiaUrl,
		conteudoMidiaHandle: currentHeader.conteudoMidiaHandle,
	};
}

function wrapPlainTextAsMessageTemplateHtml(text: string) {
	if (/<(p|div|ul|ol|li|br)\b/i.test(text)) return text;

	return text
		.split(/\n\n+/)
		.map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
		.join("");
}

function extractUnknownBodyTokens(text: string) {
	const unknownTokens: string[] = [];
	const seen = new Set<string>();

	for (const match of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
		const token = match[1]?.trim();
		if (!token || /^\d+$/.test(token) || seen.has(token)) continue;
		seen.add(token);
		unknownTokens.push(token);
	}

	return unknownTokens;
}

function extractBodyFromMetaComponent(
	component: TMetaTemplateComponent,
	currentCorpo: TMessageTemplateContent["corpo"] | null,
): { corpo: TMessageTemplateContent["corpo"]; alerts: string[] } {
	const text = component.text ?? "";
	const positions = extractOrderedMessageTemplatePositions(text);
	const examples = component.example?.body_text?.[0] ?? [];
	const alerts: string[] = [];
	const currentParametersByExternalId = new Map(
		(currentCorpo?.parametros ?? [])
			.filter((parameter) => parameter.identificadorExterno)
			.map((parameter) => [parameter.identificadorExterno!, parameter]),
	);
	const identifiersByExternalId = new Map<string, string>();

	for (const token of extractUnknownBodyTokens(text)) {
		alerts.push(`A variavel {{${token}}} retornada pela Meta nao usa identificador posicional e precisa de revisao.`);
	}

	for (const position of positions) {
		const externalId = String(position);
		const parameter = currentParametersByExternalId.get(externalId);
		if (!parameter) {
			alerts.push(`O parametro {{${externalId}}} retornado pela Meta nao possui correspondencia local.`);
			continue;
		}
		identifiersByExternalId.set(externalId, parameter.identificadorInterno);
	}

	for (const parameter of currentCorpo?.parametros ?? []) {
		if (!parameter.identificadorExterno) continue;
		if (!positions.includes(Number(parameter.identificadorExterno))) {
			alerts.push(`O parametro local ${parameter.identificadorInterno} nao foi encontrado no texto retornado pela Meta.`);
		}
	}
	const parametros = positions.flatMap((position, index) => {
		const externalId = String(position);
		const currentParameter = currentParametersByExternalId.get(externalId);
		if (!currentParameter) return [];

		return [
			{
				identificadorInterno: currentParameter.identificadorInterno,
				identificadorExterno: externalId,
				exemplo: currentParameter.exemplo ?? examples[index] ?? getDefaultMessageTemplateVariableExample(currentParameter.identificadorInterno),
			},
		];
	});

	return {
		corpo: {
			conteudo: wrapPlainTextAsMessageTemplateHtml(
				text.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, positionValue) => {
					const identificadorInterno = identifiersByExternalId.get(positionValue.trim());
					return identificadorInterno ? buildMessageTemplateMentionSpan(identificadorInterno) : match;
				}),
			),
			parametros,
		},
		alerts,
	};
}

function extractLegacyBodyFromMetaComponent(component: TMetaTemplateComponent): TMessageTemplateContent["corpo"] {
	const text = component.text ?? "";
	const positions = extractOrderedMessageTemplatePositions(text);
	const examples = component.example?.body_text?.[0] ?? [];

	return {
		conteudo: text,
		parametros: positions.map((position, index) => ({
			identificadorInterno: `param_${position}`,
			identificadorExterno: String(position),
			exemplo: examples[index] ?? "Exemplo",
		})),
	};
}

// A Meta devolve um botão de pesquisa como QUICK_REPLY comum: o vínculo campo/opção só existe
// localmente. Um sync que reescrevesse `botoes` a partir da Meta apagaria a pesquisa — então o
// botão local sobrevive quando a Meta confirma um quick reply com o mesmo texto na mesma posição.
function extractButtonsFromMetaComponent(component: TMetaTemplateComponent, currentButtons: TMessageTemplateContent["botoes"] | null): TMessageTemplateContent["botoes"] {
	return (component.buttons ?? []).map((button, index) => {
		const localButton = currentButtons?.[index];
		if (button.type === "QUICK_REPLY" && localButton?.tipo === "RESPOSTA_PESQUISA" && localButton.texto === button.text) return localButton;
		return extractButtonFromMetaButton(button);
	});
}

function extractButtonFromMetaButton(button: TMetaTemplateButton): TMessageTemplateContent["botoes"][number] {
	if (button.type === "QUICK_REPLY") return { tipo: "RESPOSTA RÁPIDA", texto: button.text };
	if (button.type === "PHONE_NUMBER") return { tipo: "TELEFONE", texto: button.text, telefone: button.phone_number ?? "" };
	return { tipo: "URL", texto: button.text, url: button.url ?? "" };
}

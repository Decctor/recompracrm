import type { TMessageTemplateContent } from "@/schemas/message-templates";
import {
	MESSAGE_TEMPLATE_BODY_MAX_LENGTH,
	MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH,
	MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT,
	MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH,
	MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH,
} from "./constants";
import { convertHtmlToWhatsappText } from "./formatting";
import { extractUnknownMessageTemplateVariables, getMessageTemplateVariableSources } from "./parsing";
import { validateSurveyButtonsShape } from "./surveys";
import type { TMessageTemplateValidationIssue, TMessageTemplateValidationResult } from "./types";

function buildResult(issues: TMessageTemplateValidationIssue[]): TMessageTemplateValidationResult {
	return {
		valid: issues.every((issue) => issue.severity !== "error"),
		issues,
	};
}

export function validateUniversalMessageTemplateContent(content: TMessageTemplateContent): TMessageTemplateValidationResult {
	const issues: TMessageTemplateValidationIssue[] = [];
	const unknownVariables = extractUnknownMessageTemplateVariables(getMessageTemplateVariableSources(content));

	if (!content.corpo.conteudo.trim()) {
		issues.push({ path: "conteudo.corpo.conteudo", message: "Conteúdo do corpo não informado.", severity: "error" });
	}
	if (unknownVariables.length > 0) {
		issues.push({
			path: "conteudo",
			message: `Variáveis não permitidas: ${unknownVariables.map((variable) => `{{${variable}}}`).join(", ")}.`,
			severity: "error",
		});
	}

	return buildResult(issues);
}

export function validateMessageTemplateForWhatsapp(content: TMessageTemplateContent): TMessageTemplateValidationResult {
	const issues = [...validateUniversalMessageTemplateContent(content).issues];
	const bodyText = convertHtmlToWhatsappText(content.corpo.conteudo);

	if (bodyText.length > MESSAGE_TEMPLATE_BODY_MAX_LENGTH) {
		issues.push({
			path: "conteudo.corpo.conteudo",
			message: `Conteúdo do corpo excede ${MESSAGE_TEMPLATE_BODY_MAX_LENGTH} caracteres (${bodyText.length}).`,
			severity: "error",
		});
	}

	if (content.cabecalho?.tipo === "TEXTO" && (content.cabecalho.conteudoTexto?.length ?? 0) > MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH) {
		issues.push({
			path: "conteudo.cabecalho.conteudoTexto",
			message: `Cabeçalho excede ${MESSAGE_TEMPLATE_HEADER_TEXT_MAX_LENGTH} caracteres.`,
			severity: "error",
		});
	}

	if ((content.rodape?.length ?? 0) > MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH) {
		issues.push({
			path: "conteudo.rodape",
			message: `Rodapé excede ${MESSAGE_TEMPLATE_FOOTER_MAX_LENGTH} caracteres.`,
			severity: "error",
		});
	}

	if (content.botoes.length > MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT) {
		issues.push({
			path: "conteudo.botoes",
			message: `Número de botões excede ${MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT}.`,
			severity: "error",
		});
	}

	for (const [index, button] of content.botoes.entries()) {
		if (button.texto.length > MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH) {
			issues.push({
				path: `conteudo.botoes.${index}.texto`,
				message: `Texto do botão ${index + 1} excede ${MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH} caracteres.`,
				severity: "error",
			});
		}
	}

	issues.push(...validateSurveyButtonsShape(content));

	return buildResult(issues);
}

export function validateMessageTemplateForEmail(content: TMessageTemplateContent): TMessageTemplateValidationResult {
	const issues = [...validateUniversalMessageTemplateContent(content).issues];

	if (!content.assunto.trim()) {
		issues.push({ path: "conteudo.assunto", message: "O e-mail precisa de assunto.", severity: "error" });
	}
	if (content.assunto.length > 80) {
		issues.push({ path: "conteudo.assunto", message: "O assunto pode ficar cortado em caixas de entrada.", severity: "warning" });
	}
	if (!content.preheader.trim()) {
		issues.push({ path: "conteudo.preheader", message: "Preheader recomendado para melhorar leitura na caixa de entrada.", severity: "warning" });
	}

	return buildResult(issues);
}

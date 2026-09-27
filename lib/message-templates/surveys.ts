import type { TMessageTemplateContent } from "@/schemas/message-templates";
import type { TMessageTemplateValidationIssue } from "./types";

/**
 * Helpers puros dos botões de pesquisa (`RESPOSTA_PESQUISA`) — docs/dev-planning/survey-campaigns-plan.md.
 * Sem banco: o que depende do campo personalizado vive em `./survey-validation.ts`.
 */

export type TMessageTemplateSurveyButton = Extract<TMessageTemplateContent["botoes"][number], { tipo: "RESPOSTA_PESQUISA" }>;

// Orçamento do payload do quick reply (≤128 chars na Meta): `psq:` + uuid + `:` + valor.
export const SURVEY_OPTION_VALUE_MAX_LENGTH = 64;
// Uma pesquisa precisa de escolha: um botão só é um CTA, não uma pergunta.
export const SURVEY_MIN_BUTTONS = 2;

export function isSurveyButton(button: TMessageTemplateContent["botoes"][number]): button is TMessageTemplateSurveyButton {
	return button.tipo === "RESPOSTA_PESQUISA";
}

export function getSurveyButtons(content: Pick<TMessageTemplateContent, "botoes">): TMessageTemplateSurveyButton[] {
	return content.botoes.filter(isSurveyButton);
}

/** O campo da pesquisa do template, ou null quando o template não tem botões de pesquisa. */
export function getSurveyFieldId(content: Pick<TMessageTemplateContent, "botoes">): string | null {
	return getSurveyButtons(content)[0]?.campoId ?? null;
}

export function isSurveyTemplateContent(content: Pick<TMessageTemplateContent, "botoes">) {
	return getSurveyButtons(content).length > 0;
}

/**
 * Checagens que não precisam do banco: um campo por template, opções sem repetição e valor dentro
 * do orçamento do payload. A existência do campo e das opções é checada em `survey-validation.ts`.
 */
export function validateSurveyButtonsShape(content: Pick<TMessageTemplateContent, "botoes">): TMessageTemplateValidationIssue[] {
	const surveyButtons = getSurveyButtons(content);
	if (surveyButtons.length === 0) return [];

	const issues: TMessageTemplateValidationIssue[] = [];
	const fieldIds = new Set(surveyButtons.map((button) => button.campoId).filter(Boolean));
	if (fieldIds.size > 1) {
		issues.push({ path: "conteudo.botoes", message: "Todos os botões de pesquisa devem apontar para o mesmo campo personalizado.", severity: "error" });
	}

	const seenValues = new Set<string>();
	for (const [index, button] of content.botoes.entries()) {
		if (!isSurveyButton(button)) continue;
		const path = `conteudo.botoes.${index}`;
		if (!button.campoId) issues.push({ path, message: `Selecione o campo personalizado do botão ${index + 1}.`, severity: "error" });
		if (!button.opcaoValor) issues.push({ path, message: `Selecione a opção do botão ${index + 1}.`, severity: "error" });
		if (button.opcaoValor && seenValues.has(button.opcaoValor)) {
			issues.push({ path, message: `A opção do botão ${index + 1} já está em outro botão de pesquisa.`, severity: "error" });
		}
		if (button.opcaoValor.length > SURVEY_OPTION_VALUE_MAX_LENGTH) {
			issues.push({ path, message: `O valor da opção do botão ${index + 1} excede ${SURVEY_OPTION_VALUE_MAX_LENGTH} caracteres.`, severity: "error" });
		}
		seenValues.add(button.opcaoValor);
	}

	if (surveyButtons.length < SURVEY_MIN_BUTTONS) {
		issues.push({
			path: "conteudo.botoes",
			message: `Uma pesquisa precisa de ao menos ${SURVEY_MIN_BUTTONS} opções de resposta.`,
			severity: "warning",
		});
	}

	return issues;
}

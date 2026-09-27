import type { TMessageTemplateSurveyButton } from "@/lib/message-templates/surveys";
import type { TCustomFieldOption, TCustomFieldValue } from "@/schemas/custom-fields";
import type { TInteractionSurveyReply } from "@/schemas/interactions";

/**
 * Helpers puros das respostas de pesquisa (docs/dev-planning/survey-campaigns-plan.md §2.4, §6.1).
 */

function normalizeButtonText(text: string) {
	return text.trim().toLocaleLowerCase("pt-BR");
}

/** Botão de pesquisa cujo rótulo bate com o texto que o cliente devolveu (gateway e fallback do wamid). */
export function findSurveyButtonByText(buttons: TMessageTemplateSurveyButton[], text: string): TMessageTemplateSurveyButton | null {
	const normalized = normalizeButtonText(text);
	if (!normalized) return null;
	return buttons.find((button) => normalizeButtonText(button.texto) === normalized) ?? null;
}

export function findSurveyButtonByOptionValue(buttons: TMessageTemplateSurveyButton[], opcaoValor: string): TMessageTemplateSurveyButton | null {
	return buttons.find((button) => button.opcaoValor === opcaoValor) ?? null;
}

/** Título da opção para o snapshot; o rótulo do botão quando a opção já não existe no campo. */
export function resolveSurveyOptionTitle({
	options,
	button,
}: {
	options: TCustomFieldOption[] | null | undefined;
	button: TMessageTemplateSurveyButton;
}) {
	return options?.find((option) => option.valor === button.opcaoValor)?.titulo ?? button.texto;
}

/**
 * Resposta vigente de um envio a partir das entradas, na semântica do campo: a última para
 * ESCOLHA_UNICA (o cliente mudou de ideia), o conjunto para ESCOLHA_MULTIPLA.
 */
export function resolveSurveyAnswer({
	fieldType,
	replies,
}: {
	fieldType: "ESCOLHA_UNICA" | "ESCOLHA_MULTIPLA";
	replies: TInteractionSurveyReply[] | null | undefined;
}): string[] {
	if (!replies || replies.length === 0) return [];
	if (fieldType === "ESCOLHA_UNICA") return [replies[replies.length - 1].opcaoValor];
	return Array.from(new Set(replies.map((reply) => reply.opcaoValor)));
}

/**
 * Valor a gravar no campo do cliente depois de um toque. ESCOLHA_MULTIPLA acumula com o que já
 * estava lá (o campo agrega respostas de pesquisas diferentes); ESCOLHA_UNICA substitui.
 */
export function mergeSurveyAnswerIntoFieldValue({
	fieldType,
	currentValue,
	opcaoValor,
}: {
	fieldType: "ESCOLHA_UNICA" | "ESCOLHA_MULTIPLA";
	currentValue: TCustomFieldValue | null | undefined;
	opcaoValor: string;
}): TCustomFieldValue {
	if (fieldType === "ESCOLHA_UNICA") return opcaoValor;
	const current = Array.isArray(currentValue) ? currentValue : typeof currentValue === "string" && currentValue ? [currentValue] : [];
	return Array.from(new Set([...current, opcaoValor]));
}

import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { db } from "@/services/drizzle";
import { customFields } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSurveyButtons, getSurveyFieldId, validateSurveyButtonsShape } from "./surveys";

export const SURVEY_FIELD_TYPES = ["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA"] as const;
export type TSurveyFieldType = (typeof SURVEY_FIELD_TYPES)[number];

export function isSurveyFieldType(tipo: string): tipo is TSurveyFieldType {
	return (SURVEY_FIELD_TYPES as readonly string[]).includes(tipo);
}

/**
 * Valida os botões de pesquisa de um template contra o banco: o campo existe na organização, está
 * ativo, é de escolha, e cada `opcaoValor` é uma opção dele. Chamado na criação/atualização do
 * template (docs/dev-planning/survey-campaigns-plan.md §3.1). Devolve o campo para quem precisa.
 */
export async function validateSurveyButtons({ organizationId, content }: { organizationId: string; content: Pick<TMessageTemplateContent, "botoes"> }) {
	const surveyButtons = getSurveyButtons(content);
	if (surveyButtons.length === 0) return null;

	const shapeErrors = validateSurveyButtonsShape(content).filter((issue) => issue.severity === "error");
	if (shapeErrors.length > 0) throw new createHttpError.BadRequest(shapeErrors[0].message);

	const fieldId = getSurveyFieldId(content);
	if (!fieldId) throw new createHttpError.BadRequest("Selecione o campo personalizado dos botões de pesquisa.");

	const field = await db.query.customFields.findFirst({
		where: and(eq(customFields.id, fieldId), eq(customFields.organizacaoId, organizationId)),
	});
	if (!field) throw new createHttpError.BadRequest("O campo personalizado dos botões de pesquisa não foi encontrado na sua organização.");
	if (!field.ativo) throw new createHttpError.BadRequest(`O campo "${field.titulo}" está inativo e não pode receber respostas de pesquisa.`);
	if (field.entidade !== "CLIENTE") throw new createHttpError.BadRequest(`O campo "${field.titulo}" não pertence à entidade cliente.`);
	if (!isSurveyFieldType(field.tipo)) {
		throw new createHttpError.BadRequest(`O campo "${field.titulo}" precisa ser de escolha única ou múltipla para servir a uma pesquisa.`);
	}

	const optionValues = new Set((field.opcoes ?? []).map((option) => option.valor));
	const unknownOption = surveyButtons.find((button) => !optionValues.has(button.opcaoValor));
	if (unknownOption) {
		throw new createHttpError.BadRequest(`A opção "${unknownOption.opcaoValor}" não existe no campo "${field.titulo}".`);
	}

	return field;
}

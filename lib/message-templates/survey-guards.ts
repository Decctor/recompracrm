import type { TCustomFieldOption } from "@/schemas/custom-fields";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { db } from "@/services/drizzle";
import { campaignDispatches, campaigns, messageTemplates } from "@/services/drizzle/schema";
import { and, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSurveyButtons } from "./surveys";

/**
 * Guardas do acoplamento campanha ↔ template ↔ campo (docs/dev-planning/survey-campaigns-plan.md §7).
 *
 * O vínculo botão → opção vive no template e a campanha só o denormaliza, então o que precisa
 * ser protegido é cada lado enquanto o outro depende dele:
 *  - os botões de um template não mudam enquanto uma pesquisa ATIVA o referencia;
 *  - as opções de um campo não somem/mudam de valor enquanto um template não arquivado as usa;
 *  - um campo não é desativado enquanto uma pesquisa ATIVA grava nele.
 *
 * "Ativa" = `ativo = true` OU um disparo ainda em andamento. Depois que a pesquisa roda e se
 * desliga, tudo volta a ser editável: respostas atrasadas resolvem pelo payload (que leva o
 * `opcaoValor`, não o índice do botão) e cada entrada guarda seu `opcaoTitulo`.
 */

const IN_FLIGHT_DISPATCH_STATUSES = ["PENDENTE", "RESOLVENDO", "ENFILEIRADA", "ENVIANDO"] as const;

function activeSurveyCampaignCondition() {
	return and(
		eq(campaigns.gatilhoTipo, "PESQUISA"),
		or(
			eq(campaigns.ativo, true),
			exists(
				db
					.select({ id: campaignDispatches.id })
					.from(campaignDispatches)
					.where(and(eq(campaignDispatches.campanhaId, campaigns.id), inArray(campaignDispatches.status, [...IN_FLIGHT_DISPATCH_STATUSES]))),
			),
		),
	);
}

export async function findActiveSurveyCampaignsUsingTemplate({ organizationId, templateId }: { organizationId: string; templateId: string }) {
	return db
		.select({ id: campaigns.id, titulo: campaigns.titulo })
		.from(campaigns)
		.where(and(eq(campaigns.organizacaoId, organizationId), eq(campaigns.whatsappTemplateId, templateId), activeSurveyCampaignCondition()));
}

export async function findActiveSurveyCampaignsUsingField({ organizationId, fieldId }: { organizationId: string; fieldId: string }) {
	return db
		.select({ id: campaigns.id, titulo: campaigns.titulo })
		.from(campaigns)
		.where(and(eq(campaigns.organizacaoId, organizationId), eq(campaigns.gatilhoPesquisaCampoId, fieldId), activeSurveyCampaignCondition()));
}

/** Templates não arquivados com ao menos um botão de pesquisa apontando para o campo. */
export async function findSurveyTemplatesUsingField({ organizationId, fieldId }: { organizationId: string; fieldId: string }) {
	const probe = JSON.stringify([{ tipo: "RESPOSTA_PESQUISA", campoId: fieldId }]);
	return db
		.select({ id: messageTemplates.id, nome: messageTemplates.nome, conteudo: messageTemplates.conteudo })
		.from(messageTemplates)
		.where(
			and(
				eq(messageTemplates.organizacaoId, organizationId),
				ne(messageTemplates.status, "ARQUIVADO"),
				sql`${messageTemplates.conteudo}->'botoes' @> ${probe}::jsonb`,
			),
		);
}

function serializeButtonsForComparison(botoes: TMessageTemplateContent["botoes"]) {
	return JSON.stringify(
		botoes.map((button) => {
			if (button.tipo === "RESPOSTA_PESQUISA") return { tipo: button.tipo, texto: button.texto, campoId: button.campoId, opcaoValor: button.opcaoValor };
			return { tipo: button.tipo, texto: button.texto };
		}),
	);
}

function formatList(items: string[]) {
	return items.map((item) => `"${item}"`).join(", ");
}

/**
 * Só o array `botoes` é congelado: corpo, cabeçalho e rodapé continuam editáveis (uma
 * reaprovação do texto na Meta não muda o mapeamento das respostas).
 */
export async function assertTemplateButtonsNotFrozen({
	organizationId,
	templateId,
	currentContent,
	nextContent,
}: {
	organizationId: string;
	templateId: string;
	currentContent: TMessageTemplateContent;
	nextContent: TMessageTemplateContent;
}) {
	if (serializeButtonsForComparison(currentContent.botoes) === serializeButtonsForComparison(nextContent.botoes)) return;
	if (getSurveyButtons(currentContent).length === 0 && getSurveyButtons(nextContent).length === 0) return;

	const activeCampaigns = await findActiveSurveyCampaignsUsingTemplate({ organizationId, templateId });
	if (activeCampaigns.length === 0) return;

	throw new createHttpError.BadRequest(
		`Os botões deste template estão em uso pela pesquisa ${formatList(activeCampaigns.map((campaign) => campaign.titulo))}. Pause a campanha para editá-los.`,
	);
}

/**
 * Adicionar opções e editar título/legenda/ícone é livre (o botão tem o próprio `texto`). Remover
 * uma opção ou trocar o `valor` de uma opção usada por um template quebraria o mapeamento.
 */
export async function assertCustomFieldOptionsNotFrozen({
	organizationId,
	fieldId,
	currentOptions,
	nextOptions,
}: {
	organizationId: string;
	fieldId: string;
	currentOptions: TCustomFieldOption[] | null | undefined;
	nextOptions: TCustomFieldOption[] | null | undefined;
}) {
	const nextValues = new Set((nextOptions ?? []).map((option) => option.valor));
	const removedValues = (currentOptions ?? []).map((option) => option.valor).filter((valor) => !nextValues.has(valor));
	if (removedValues.length === 0) return;

	const templates = await findSurveyTemplatesUsingField({ organizationId, fieldId });
	const blockingTemplates = templates.filter((template) =>
		getSurveyButtons(template.conteudo).some((button) => button.campoId === fieldId && removedValues.includes(button.opcaoValor)),
	);
	if (blockingTemplates.length === 0) return;

	throw new createHttpError.BadRequest(
		`As opções ${formatList(removedValues)} são botões de pesquisa no template ${formatList(blockingTemplates.map((template) => template.nome))}. Arquive o template ou mantenha as opções.`,
	);
}

export async function assertCustomFieldNotUsedByActiveSurvey({ organizationId, fieldId }: { organizationId: string; fieldId: string }) {
	const activeCampaigns = await findActiveSurveyCampaignsUsingField({ organizationId, fieldId });
	if (activeCampaigns.length === 0) return;

	throw new createHttpError.BadRequest(
		`Este campo recebe as respostas da pesquisa ${formatList(activeCampaigns.map((campaign) => campaign.titulo))}. Pause a campanha para desativá-lo.`,
	);
}

import { validateTemplateForTrigger } from "@/lib/message-templates";
import { getSurveyButtons, SURVEY_MIN_BUTTONS } from "@/lib/message-templates/surveys";
import { validateSurveyButtons } from "@/lib/message-templates/survey-validation";
import { db } from "@/services/drizzle";
import { type TCampaignTriggerTypeEnum } from "@/schemas/enums";
import { CAMPAIGN_PROMOTION_PRODUCTS_LIMIT, CampaignSchema } from "@/schemas/campaigns";
import createHttpError from "http-errors";
import dayjs from "dayjs";
import z from "zod";

const TRIGGERS_SUPPORTING_ANTES: TCampaignTriggerTypeEnum[] = ["ANIVERSARIO_CLIENTE", "PIOR-DIA-VENDAS"];

export function validateRecurrentCampaign(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.gatilhoTipo !== "RECORRENTE") return;

	if (!campaign.recorrenciaTipo) {
		throw new createHttpError.BadRequest("Selecione a frequência de recorrência (DIARIO, SEMANAL ou MENSAL).");
	}

	if (campaign.recorrenciaTipo === "SEMANAL") {
		if (!campaign.recorrenciaDiasSemana) {
			throw new createHttpError.BadRequest("Selecione pelo menos um dia da semana para a campanha recorrente semanal.");
		}
		const dias: number[] = JSON.parse(campaign.recorrenciaDiasSemana);
		if (!Array.isArray(dias) || dias.length === 0 || dias.some((d) => d < 0 || d > 6)) {
			throw new createHttpError.BadRequest("Dias da semana inválidos. Use valores entre 0 (Domingo) e 6 (Sábado).");
		}
	}

	if (campaign.recorrenciaTipo === "MENSAL") {
		if (!campaign.recorrenciaDiasMes) {
			throw new createHttpError.BadRequest("Selecione pelo menos um dia do mês para a campanha recorrente mensal.");
		}
		const dias: number[] = JSON.parse(campaign.recorrenciaDiasMes);
		if (!Array.isArray(dias) || dias.length === 0 || dias.some((d) => d < 1 || d > 31)) {
			throw new createHttpError.BadRequest("Dias do mês inválidos. Use valores entre 1 e 31.");
		}
	}
}

export function validateCampaignFrequencyInterval(campaign: z.infer<typeof CampaignSchema>) {
	// Campanhas de disparo único não têm intervalo de recorrência a respeitar.
	if (campaign.gatilhoTipo === "USO-UNICO" || campaign.gatilhoTipo === "PROMOCAO-PRODUTOS" || campaign.gatilhoTipo === "PESQUISA") return;
	if (!campaign.permitirRecorrencia) return;

	if (!campaign.frequenciaIntervaloMedida || !campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0) {
		throw new createHttpError.BadRequest("A frequência de intervalo deve ser maior que zero quando a recorrência estiver ativa.");
	}
}

export function validateExecutionDelayDirection(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.execucaoAgendadaDirecao === "ANTES" && !TRIGGERS_SUPPORTING_ANTES.includes(campaign.gatilhoTipo)) {
		throw new createHttpError.BadRequest("A direção 'ANTES' só é suportada para os gatilhos: Aniversário do cliente.");
	}
}

export function validateCashbackExpiringTrigger(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.gatilhoTipo !== "CASHBACK-EXPIRANDO") return;

	if (
		!campaign.gatilhoCashbackExpirandoAntecedenciaMedida ||
		!campaign.gatilhoCashbackExpirandoAntecedenciaValor ||
		campaign.gatilhoCashbackExpirandoAntecedenciaValor <= 0
	) {
		throw new createHttpError.BadRequest("Informe uma antecedência válida para cashback expirando.");
	}
}

export function validateSingleUseCampaign(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.gatilhoTipo !== "USO-UNICO") return;

	if (!campaign.gatilhoUsoUnicoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência do uso único não informada.");
	}

	const date = dayjs(campaign.gatilhoUsoUnicoDataReferencia);
	if (!date.isValid() || date.format("YYYY-MM-DD") !== campaign.gatilhoUsoUnicoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência do uso único inválida.");
	}
}

/**
 * Valida a configuração do gatilho "PROMOCAO-PRODUTOS": data de referência (mesma semântica do
 * uso único) e a lista curada de produtos promovidos.
 *
 * O preço promocional é a fonte da verdade do desconto — não existe percentual persistido.
 * A checagem de existência/atividade/posse dos produtos é assíncrona porque depende do banco.
 */
export async function validateProductPromotionCampaign(campaign: z.infer<typeof CampaignSchema>, organizationId: string) {
	if (campaign.gatilhoTipo !== "PROMOCAO-PRODUTOS") return;

	if (!campaign.gatilhoPromocaoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência da promoção não informada.");
	}

	const date = dayjs(campaign.gatilhoPromocaoDataReferencia);
	if (!date.isValid() || date.format("YYYY-MM-DD") !== campaign.gatilhoPromocaoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência da promoção inválida.");
	}

	const promotionProducts = campaign.gatilhoPromocaoProdutos ?? [];
	if (promotionProducts.length === 0) {
		throw new createHttpError.BadRequest("Selecione ao menos um produto para a promoção.");
	}
	if (promotionProducts.length > CAMPAIGN_PROMOTION_PRODUCTS_LIMIT) {
		throw new createHttpError.BadRequest(`A promoção suporta no máximo ${CAMPAIGN_PROMOTION_PRODUCTS_LIMIT} produtos.`);
	}

	const productIds = promotionProducts.map((promotionProduct) => promotionProduct.produtoId);
	if (new Set(productIds).size !== productIds.length) {
		throw new createHttpError.BadRequest("Há produtos repetidos na lista da promoção.");
	}

	for (const promotionProduct of promotionProducts) {
		if (promotionProduct.precoPromocional != null && promotionProduct.precoPromocional <= 0) {
			throw new createHttpError.BadRequest("O preço promocional deve ser maior que zero.");
		}
	}

	const existingProducts = await db.query.products.findMany({
		where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.id, productIds)),
		columns: { id: true, nome: true, ativo: true, precoVenda: true },
	});
	const existingProductById = new Map(existingProducts.map((product) => [product.id, product]));

	const missingProductIds = productIds.filter((productId) => !existingProductById.has(productId));
	if (missingProductIds.length > 0) {
		throw new createHttpError.BadRequest("Há produtos da promoção que não foram encontrados na sua organização.");
	}

	const inactiveProducts = existingProducts.filter((product) => !product.ativo);
	if (inactiveProducts.length > 0) {
		throw new createHttpError.BadRequest(`Há produtos inativos na promoção: ${inactiveProducts.map((product) => product.nome).join(", ")}.`);
	}

	// Sem preço de venda no cadastro (produtos cujo preço vive nas variantes, que o gatilho não
	// resolve), o preço promocional deixa de ser opcional: é o único número que a mensagem tem.
	// Sem ele, promotion_product_price renderizaria "R$ 0,00" para o cliente.
	const productsMissingPrice = promotionProducts.filter((promotionProduct) => {
		if (promotionProduct.precoPromocional != null) return false;
		const catalogProduct = existingProductById.get(promotionProduct.produtoId);
		return !catalogProduct?.precoVenda || catalogProduct.precoVenda <= 0;
	});
	if (productsMissingPrice.length > 0) {
		const names = productsMissingPrice.map((p) => existingProductById.get(p.produtoId)?.nome ?? p.produtoId).join(", ");
		throw new createHttpError.BadRequest(`Defina um preço promocional para produtos sem preço de venda no cadastro: ${names}.`);
	}
}

/**
 * Valida a configuração do gatilho "PESQUISA" (docs/dev-planning/survey-campaigns-plan.md §4.2):
 * data de referência (mesma semântica do uso único), campo escolhido, template com botões de
 * pesquisa apontando para esse campo, e o campo ativo/de escolha com todas as opções dos botões.
 *
 * Também vale no sentido inverso: um template com botões de pesquisa só entra em campanha de
 * pesquisa. A captura já é agnóstica de gatilho; liberar outros gatilhos é relaxar esta checagem.
 */
export async function validateSurveyCampaign(campaign: z.infer<typeof CampaignSchema>, organizationId: string) {
	const template = campaign.whatsappTemplateId
		? await db.query.messageTemplates.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, campaign.whatsappTemplateId), eq(fields.organizacaoId, organizationId)),
				columns: { nome: true, conteudo: true },
			})
		: null;
	const surveyButtons = template ? getSurveyButtons(template.conteudo) : [];

	if (campaign.gatilhoTipo !== "PESQUISA") {
		if (surveyButtons.length > 0) {
			throw new createHttpError.BadRequest(`O template "${template?.nome}" tem botões de pesquisa e só pode ser usado em campanhas de pesquisa.`);
		}
		return;
	}

	if (!campaign.gatilhoPesquisaDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência da pesquisa não informada.");
	}
	const date = dayjs(campaign.gatilhoPesquisaDataReferencia);
	if (!date.isValid() || date.format("YYYY-MM-DD") !== campaign.gatilhoPesquisaDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência da pesquisa inválida.");
	}
	if (!campaign.gatilhoPesquisaCampoId) {
		throw new createHttpError.BadRequest("Selecione o campo personalizado que receberá as respostas da pesquisa.");
	}
	if (!template) throw new createHttpError.BadRequest("Selecione o template da pesquisa.");
	if (surveyButtons.length < SURVEY_MIN_BUTTONS) {
		throw new createHttpError.BadRequest(`O template "${template.nome}" precisa de ao menos ${SURVEY_MIN_BUTTONS} botões de pesquisa.`);
	}
	if (surveyButtons.some((button) => button.campoId !== campaign.gatilhoPesquisaCampoId)) {
		throw new createHttpError.BadRequest(`Os botões de pesquisa do template "${template.nome}" apontam para outro campo personalizado.`);
	}
	// Re-checa contra o banco: o campo pode ter sido desativado ou perdido opções depois que o
	// template foi salvo.
	await validateSurveyButtons({ organizationId, content: template.conteudo });
}

export async function validateCampaignTemplateTriggerCompatibility(
	whatsappTemplateId: string | null | undefined,
	gatilhoTipo: TCampaignTriggerTypeEnum,
) {
	if (!whatsappTemplateId) return;

	const template = await db.query.messageTemplates.findFirst({
		where: (fields, { eq }) => eq(fields.id, whatsappTemplateId),
		columns: { conteudo: true },
	});
	if (!template) return;

	const parametros = template.conteudo.corpo.parametros.map((parametro) => ({
		nome: parametro.identificadorInterno,
		exemplo: parametro.exemplo,
		identificador: parametro.identificadorInterno,
	}));
	const validation = validateTemplateForTrigger(parametros, gatilhoTipo);
	if (!validation.valid) {
		throw new createHttpError.BadRequest(
			`O template selecionado contém variáveis incompatíveis com o gatilho escolhido: ${validation.incompatibleVariables.join(", ")}.`,
		);
	}
}

export async function getOrganizationWeeklyCampaignLimit(organizationId: string) {
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizationId),
		columns: { configuracao: true },
	});

	return organization?.configuracao?.preferencias?.limiteMensagensSemanaisViaCampanhas ?? null;
}

// Rejects a campaign weekly limit above the organization limit at save time. Before this,
// the excess was silently clamped during processing, surfacing only as blocked sends.
export function validateCampaignWeeklyLimit({
	campaignWeeklyLimit,
	organizationWeeklyLimit,
}: {
	campaignWeeklyLimit: number | null | undefined;
	organizationWeeklyLimit: number | null;
}) {
	if (campaignWeeklyLimit == null || organizationWeeklyLimit == null) return;

	if (campaignWeeklyLimit > organizationWeeklyLimit) {
		throw new createHttpError.BadRequest(
			`O limite semanal de envios da campanha (${campaignWeeklyLimit}) não pode ser maior que o limite semanal da organização (${organizationWeeklyLimit}).`,
		);
	}
}

export function validateCampaignCashbackGeneration(campaign: z.infer<typeof CampaignSchema>) {
	if (!campaign.cashbackGeracaoAtivo) return;

	if (!campaign.cashbackGeracaoTipo) {
		throw new createHttpError.BadRequest("Selecione o tipo de geração de cashback (FIXO ou PERCENTUAL).");
	}
	if (!campaign.cashbackGeracaoValor || campaign.cashbackGeracaoValor <= 0) {
		throw new createHttpError.BadRequest("Informe um valor válido para o cashback.");
	}
	if (campaign.cashbackGeracaoTipo === "PERCENTUAL") {
		const validTriggersForPercentual = ["NOVA-COMPRA", "PRIMEIRA-COMPRA"];
		if (!validTriggersForPercentual.includes(campaign.gatilhoTipo)) {
			throw new createHttpError.BadRequest("Cashback percentual só pode ser usado com gatilhos NOVA-COMPRA ou PRIMEIRA-COMPRA.");
		}
	}
}

export function validateCampaignCouponGeneration(campaign: z.infer<typeof CampaignSchema>) {
	if (!campaign.cupomGeracaoAtivo) return;

	if (!campaign.cupomGeracaoCupomId) {
		throw new createHttpError.BadRequest("Selecione o cupom a ser atribuído pela campanha.");
	}
}

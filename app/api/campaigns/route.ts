import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { getOrganizationWeeklyCampaignLimit, validateCampaignWeeklyLimit, validateProductPromotionCampaign } from "@/lib/campaigns/validation";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { validateTemplateForTrigger } from "@/lib/message-templates";
import { CampaignSchema, CampaignSegmentationSchema } from "@/schemas/campaigns";
import { CampaignTriggerTypeEnum, type TCampaignTriggerTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { campaignConversions, interactions } from "@/services/drizzle/schema";
import { campaignSegmentations, campaigns } from "@/services/drizzle/schema/campaigns";
import dayjs from "dayjs";
import { and, count, eq, gte, inArray, isNotNull, lte, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

function validateRecurrentCampaign(campaign: z.infer<typeof CampaignSchema>) {
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

function validateCampaignFrequencyInterval(campaign: z.infer<typeof CampaignSchema>) {
	// Campanhas de disparo único não têm intervalo de recorrência a respeitar.
	if (campaign.gatilhoTipo === "USO-UNICO" || campaign.gatilhoTipo === "PROMOCAO-PRODUTOS") return;
	if (!campaign.permitirRecorrencia) return;

	if (!campaign.frequenciaIntervaloMedida || !campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0) {
		throw new createHttpError.BadRequest("A frequência de intervalo deve ser maior que zero quando a recorrência estiver ativa.");
	}
}

const TRIGGERS_SUPPORTING_ANTES: TCampaignTriggerTypeEnum[] = ["ANIVERSARIO_CLIENTE", "PIOR-DIA-VENDAS"];

function validateExecutionDelayDirection(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.execucaoAgendadaDirecao === "ANTES" && !TRIGGERS_SUPPORTING_ANTES.includes(campaign.gatilhoTipo)) {
		throw new createHttpError.BadRequest("A direção 'ANTES' só é suportada para os gatilhos: Aniversário do cliente.");
	}
}

function validateCashbackExpiringTrigger(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.gatilhoTipo !== "CASHBACK-EXPIRANDO") return;

	if (
		!campaign.gatilhoCashbackExpirandoAntecedenciaMedida ||
		!campaign.gatilhoCashbackExpirandoAntecedenciaValor ||
		campaign.gatilhoCashbackExpirandoAntecedenciaValor <= 0
	) {
		throw new createHttpError.BadRequest("Informe uma antecedência válida para cashback expirando.");
	}
}

function validateSingleUseCampaign(campaign: z.infer<typeof CampaignSchema>) {
	if (campaign.gatilhoTipo !== "USO-UNICO") return;

	if (!campaign.gatilhoUsoUnicoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência do uso único não informada.");
	}

	const date = dayjs(campaign.gatilhoUsoUnicoDataReferencia);
	if (!date.isValid() || date.format("YYYY-MM-DD") !== campaign.gatilhoUsoUnicoDataReferencia) {
		throw new createHttpError.BadRequest("Data de referência do uso único inválida.");
	}
}

async function validateCampaignTemplateTriggerCompatibility(
	whatsappTemplateId: string | null | undefined,
	gatilhoTipo: TCampaignTriggerTypeEnum,
	organizationId: string,
) {
	if (!whatsappTemplateId) return;
	const template = await db.query.messageTemplates.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, whatsappTemplateId), eq(fields.organizacaoId, organizationId)),
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

/**
 * Valida a configuração de geração de cupom da campanha: o cupom deve existir na
 * organização, estar ativo e ter escopo INDIVIDUAL (a campanha materializa atribuições).
 */
async function validateCampaignCouponGenerationSettings(
	campaign: Pick<z.infer<typeof CampaignSchema>, "cupomGeracaoAtivo" | "cupomGeracaoCupomId">,
	userOrgId: string,
) {
	if (!campaign.cupomGeracaoAtivo) return;
	if (!campaign.cupomGeracaoCupomId) throw new createHttpError.BadRequest("Selecione o cupom a ser atribuído pela campanha.");

	const coupon = await db.query.coupons.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, campaign.cupomGeracaoCupomId as string), eq(fields.organizacaoId, userOrgId)),
		columns: { id: true, escopo: true, ativo: true },
	});
	if (!coupon) throw new createHttpError.BadRequest("Cupom selecionado não encontrado.");
	if (coupon.escopo !== "INDIVIDUAL") throw new createHttpError.BadRequest("A campanha só pode atribuir cupons de escopo INDIVIDUAL.");
	if (!coupon.ativo) throw new createHttpError.BadRequest("O cupom selecionado está inativo.");
}

export async function validateCampaignConfiguration({
	campaign,
	organizationId,
}: {
	campaign: z.infer<typeof CampaignSchema>;
	organizationId: string;
}) {
	if (campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO" && (!campaign.gatilhoTempoPermanenciaMedida || !campaign.gatilhoTempoPermanenciaValor)) {
		throw new createHttpError.BadRequest("Defina um tempo de permanência para a segmentação.");
	}
	validateRecurrentCampaign(campaign);
	validateSingleUseCampaign(campaign);
	validateCashbackExpiringTrigger(campaign);
	validateCampaignFrequencyInterval(campaign);
	validateExecutionDelayDirection(campaign);
	// Mesma checagem que createCampaign/updateCampaign fazem: sem ela o dry-run de
	// `validate_campaign_draft` aprovaria uma promoção que a criação depois recusa.
	await validateProductPromotionCampaign(campaign, organizationId);
	await validateCampaignTemplateTriggerCompatibility(campaign.whatsappTemplateId, campaign.gatilhoTipo, organizationId);
	validateCampaignWeeklyLimit({
		campaignWeeklyLimit: campaign.limiteEnviosSemanais,
		organizationWeeklyLimit: await getOrganizationWeeklyCampaignLimit(organizationId),
	});
	if (campaign.cashbackGeracaoAtivo) {
		if (!campaign.cashbackGeracaoTipo) throw new createHttpError.BadRequest("Selecione o tipo de geração de cashback (FIXO ou PERCENTUAL).");
		if (!campaign.cashbackGeracaoValor || campaign.cashbackGeracaoValor <= 0) {
			throw new createHttpError.BadRequest("Informe um valor válido para o cashback.");
		}
		if (campaign.cashbackGeracaoTipo === "PERCENTUAL" && !["NOVA-COMPRA", "PRIMEIRA-COMPRA"].includes(campaign.gatilhoTipo)) {
			throw new createHttpError.BadRequest("Cashback percentual só pode ser usado com gatilhos NOVA-COMPRA ou PRIMEIRA-COMPRA.");
		}
	}
	await validateCampaignCouponGenerationSettings(campaign, organizationId);
}

export const CreateCampaignInputSchema = z.object({
	campaign: CampaignSchema.omit({ dataInsercao: true, autorId: true }),
	segmentations: z.array(CampaignSegmentationSchema.omit({ campanhaId: true })),
});
export type TCreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

export async function createCampaign({
	input,
	organizationId: userOrgId,
	authorId,
}: {
	input: TCreateCampaignInput;
	organizationId: string;
	authorId: string;
}) {
	// Doing some validations before starting the process
	if (
		input.campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO" &&
		(!input.campaign.gatilhoTempoPermanenciaMedida || !input.campaign.gatilhoTempoPermanenciaValor)
	) {
		throw new createHttpError.BadRequest("Define um tempo de permanência para a segmentação.");
	}

	// Validate recurrent campaign settings
	validateRecurrentCampaign(input.campaign as z.infer<typeof CampaignSchema>);
	validateSingleUseCampaign(input.campaign as z.infer<typeof CampaignSchema>);
	validateCashbackExpiringTrigger(input.campaign as z.infer<typeof CampaignSchema>);
	validateCampaignFrequencyInterval(input.campaign as z.infer<typeof CampaignSchema>);
	validateExecutionDelayDirection(input.campaign as z.infer<typeof CampaignSchema>);

	await validateProductPromotionCampaign(input.campaign as z.infer<typeof CampaignSchema>, userOrgId);

	// Validate template-trigger compatibility
	await validateCampaignTemplateTriggerCompatibility(input.campaign.whatsappTemplateId, input.campaign.gatilhoTipo, userOrgId);
	const organizationWeeklyLimit = await getOrganizationWeeklyCampaignLimit(userOrgId);
	validateCampaignWeeklyLimit({
		campaignWeeklyLimit: input.campaign.limiteEnviosSemanais,
		organizationWeeklyLimit,
	});

	// Validate cashback generation settings
	if (input.campaign.cashbackGeracaoAtivo) {
		if (!input.campaign.cashbackGeracaoTipo) {
			throw new createHttpError.BadRequest("Selecione o tipo de geração de cashback (FIXO ou PERCENTUAL).");
		}
		if (!input.campaign.cashbackGeracaoValor || input.campaign.cashbackGeracaoValor <= 0) {
			throw new createHttpError.BadRequest("Informe um valor válido para o cashback.");
		}
		// Validate PERCENTUAL is only used with sale-value triggers
		if (input.campaign.cashbackGeracaoTipo === "PERCENTUAL") {
			const validTriggersForPercentual = ["NOVA-COMPRA", "PRIMEIRA-COMPRA"];
			if (!validTriggersForPercentual.includes(input.campaign.gatilhoTipo)) {
				throw new createHttpError.BadRequest("Cashback percentual só pode ser usado com gatilhos NOVA-COMPRA ou PRIMEIRA-COMPRA.");
			}
		}
	}

	await validateCampaignCouponGenerationSettings(input.campaign, userOrgId);

	const insertedCampaignId = await db.transaction(async (trx) => {
		const insertedCampaignResponse = await trx
			.insert(campaigns)
			.values({ ...input.campaign, organizacaoId: userOrgId, autorId: authorId })
			.returning({ id: campaigns.id });
		const campaignId = insertedCampaignResponse[0]?.id;
		if (!campaignId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar campanha.");
		if (input.segmentations.length > 0)
			await trx.insert(campaignSegmentations).values(
				input.segmentations.map((segmentation) => ({
					...segmentation,
					campanhaId: campaignId,
					organizacaoId: userOrgId,
				})),
			);
		return campaignId;
	});

	return {
		data: {
			insertedId: insertedCampaignId,
		},
		message: "Campanha criada com sucesso.",
	};
}
export type TCreateCampaignOutput = Awaited<ReturnType<typeof createCampaign>>;

const createCampaignRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = await request.json();
	const parsedInput = CreateCampaignInputSchema.parse(input);
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await createCampaign({ input: parsedInput, organizationId, authorId: session.user.id });
	return NextResponse.json(result, { status: 201 });
};

export const POST = appApiHandler({
	POST: createCampaignRoute,
});

const GetCampaignsInputSchema = z.object({
	// By ID params
	id: z
		.string({
			required_error: "ID da campanha não informado.",
			invalid_type_error: "Tipo não válido para o ID da campanha.",
		})
		.optional()
		.nullable(),
	// General params
	search: z
		.string({
			required_error: "Busca não informada.",
			invalid_type_error: "Tipo não válido para a busca.",
		})
		.optional()
		.nullable(),
	triggerTypes: z
		.array(z.string({ invalid_type_error: "Tipo não válido para os tipos de gatilho." }))
		.refine((v) => CampaignTriggerTypeEnum.safeParse(v).success, {
			message: "Tipo não válido para os tipos de gatilho.",
		})
		.optional()
		.nullable(),
	actionWhatsappOnly: z
		.boolean({
			invalid_type_error: "Tipo não válido para a ação WhatsApp apenas.",
		})
		.optional()
		.nullable(),
	cashbackGenerationOnly: z
		.boolean({
			invalid_type_error: "Tipo não válido para a geração de cashback.",
		})
		.optional()
		.nullable(),
	activeOnly: z
		.string({
			invalid_type_error: "Tipo não válido para o ativo da campanha.",
		})
		.optional()
		.nullable()
		.transform((v) => v === "true"),
	statsPeriodAfter: z
		.string({
			required_error: "Período inicial das estatísticas não informado.",
			invalid_type_error: "Tipo não válido para o período inicial das estatísticas.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : null)),
	statsPeriodBefore: z
		.string({
			required_error: "Período final das estatísticas não informado.",
			invalid_type_error: "Tipo não válido para o período final das estatísticas.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : null)),
});
export type TGetCampaignsInput = z.infer<typeof GetCampaignsInputSchema>;

async function getCampaigns({ input, session }: { input: TGetCampaignsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if ("id" in input && input.id) {
		const campaignId = input.id;
		if (!campaignId) throw new createHttpError.BadRequest("ID da campanha não informado.");

		const campaign = await db.query.campaigns.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, campaignId), eq(fields.organizacaoId, userOrgId)),
			with: {
				segmentacoes: true,
				whatsappTemplate: {
					columns: {
						id: true,
						nome: true,
						conteudo: true,
					},
				},
				whatsappConexaoTelefone: {
					columns: {
						id: true,
						nome: true,
						numero: true,
					},
				},
			},
		});
		if (!campaign) throw new createHttpError.NotFound("Campanha não encontrada.");

		return {
			data: {
				byId: campaign,
				default: null,
			},
			message: "Campanha encontrada com sucesso.",
		};
	}

	const conditions = [eq(campaigns.organizacaoId, userOrgId)];
	if (input.search && input.search.trim().length > 0) {
		const searchCondition = or(
			sql`(to_tsvector('portuguese', ${campaigns.titulo}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${campaigns.titulo} ILIKE '%' || ${input.search} || '%')`,
			sql`(to_tsvector('portuguese', ${campaigns.descricao}) @@ plainto_tsquery('portuguese', ${input.search}) OR ${campaigns.descricao} ILIKE '%' || ${input.search} || '%')`,
		);
		if (searchCondition) {
			conditions.push(searchCondition);
		}
	}
	if (input.triggerTypes && input.triggerTypes.length > 0) {
		conditions.push(inArray(campaigns.gatilhoTipo, input.triggerTypes as TCampaignTriggerTypeEnum[]));
	}
	if (input.actionWhatsappOnly) {
		conditions.push(isNotNull(campaigns.whatsappTemplateId));
	}
	if (input.cashbackGenerationOnly) {
		conditions.push(eq(campaigns.cashbackGeracaoAtivo, true));
	}
	if (input.activeOnly) {
		conditions.push(eq(campaigns.ativo, true));
	}

	const campaignsResult = await db.query.campaigns.findMany({
		where: and(...conditions),
		with: {
			segmentacoes: true,
			whatsappTemplate: {
				columns: {
					id: true,
					nome: true,
					conteudo: true,
				},
			},
		},
	});

	if (campaignsResult.length === 0) {
		return {
			data: {
				byId: null,
				default: [],
			},
			message: "Campanhas encontradas com sucesso.",
		};
	}

	const campaignIds = campaignsResult.map((campaign) => campaign.id);
	const interactionsConditions = [
		eq(interactions.organizacaoId, userOrgId),
		eq(interactions.tipo, "ENVIO-MENSAGEM"),
		inArray(interactions.campanhaId, campaignIds),
		inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES]),
	];
	if (input.statsPeriodAfter) interactionsConditions.push(gte(interactions.dataInsercao, input.statsPeriodAfter));
	if (input.statsPeriodBefore) interactionsConditions.push(lte(interactions.dataInsercao, input.statsPeriodBefore));

	const interactionsStats = await db
		.select({
			campaignId: interactions.campanhaId,
			sentCount: count(interactions.id),
			deliveredCount: sum(sql<number>`CASE WHEN ${interactions.statusEnvio} IN ('ENTREGUE', 'LIDO') THEN 1 ELSE 0 END`),
		})
		.from(interactions)
		.where(and(...interactionsConditions))
		.groupBy(interactions.campanhaId);

	const conversionsConditions = [eq(campaignConversions.organizacaoId, userOrgId), inArray(campaignConversions.campanhaId, campaignIds)];
	if (input.statsPeriodAfter) conversionsConditions.push(gte(campaignConversions.dataConversao, input.statsPeriodAfter));
	if (input.statsPeriodBefore) conversionsConditions.push(lte(campaignConversions.dataConversao, input.statsPeriodBefore));

	const conversionsStats = await db
		.select({
			campaignId: campaignConversions.campanhaId,
			conversionsCount: count(campaignConversions.id),
			revenueTotal: sum(campaignConversions.atribuicaoReceita),
		})
		.from(campaignConversions)
		.where(and(...conversionsConditions))
		.groupBy(campaignConversions.campanhaId);

	const interactionsStatsMap = new Map(
		interactionsStats.map((row) => [
			row.campaignId,
			{
				sentCount: Number(row.sentCount ?? 0),
				deliveredCount: Number(row.deliveredCount ?? 0),
			},
		]),
	);
	const conversionsStatsMap = new Map(
		conversionsStats.map((row) => [
			row.campaignId,
			{
				conversionsCount: Number(row.conversionsCount ?? 0),
				revenueTotal: Number(row.revenueTotal ?? 0),
			},
		]),
	);
	const campaignsEnriched = campaignsResult.map((campaign) => {
		const interactionStats = interactionsStatsMap.get(campaign.id);
		const conversionStats = conversionsStatsMap.get(campaign.id);
		const envios = interactionStats?.sentCount ?? 0;
		const convertidos = conversionStats?.conversionsCount ?? 0;
		const taxaConversao = envios > 0 ? (convertidos / envios) * 100 : 0;

		return {
			...campaign,
			estatisticas: {
				envios,
				entregues: interactionStats?.deliveredCount ?? 0,
				convertidos,
				taxaConversao: Math.round(taxaConversao * 100) / 100,
				receita: conversionStats?.revenueTotal ?? 0,
			},
		};
	});

	return {
		data: {
			byId: null,
			default: campaignsEnriched,
		},
		message: "Campanhas encontradas com sucesso.",
	};
}
export type TGetCampaignsOutput = Awaited<ReturnType<typeof getCampaigns>>;
export type TGetCampaignsOutputDefault = Exclude<TGetCampaignsOutput["data"]["default"], undefined | null>;
export type TGetCampaignsOutputById = Exclude<TGetCampaignsOutput["data"]["byId"], undefined | null>;

const getCampaignsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const triggerTypesParam = searchParams.get("triggerTypes");
	const actionWhatsappOnlyParam = searchParams.get("actionWhatsappOnly");
	const cashbackGenerationOnlyParam = searchParams.get("cashbackGenerationOnly");
	const input = GetCampaignsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		activeOnly: searchParams.get("activeOnly") ?? undefined,
		triggerTypes: triggerTypesParam ? triggerTypesParam.split(",") : undefined,
		actionWhatsappOnly: actionWhatsappOnlyParam === null ? undefined : actionWhatsappOnlyParam === "true",
		cashbackGenerationOnly: cashbackGenerationOnlyParam === null ? undefined : cashbackGenerationOnlyParam === "true",
		statsPeriodAfter: searchParams.get("statsPeriodAfter") ?? undefined,
		statsPeriodBefore: searchParams.get("statsPeriodBefore") ?? undefined,
	});
	const result = await getCampaigns({ input, session: session });
	return NextResponse.json(result, { status: 200 });
};
export const GET = appApiHandler({
	GET: getCampaignsRoute,
});

export const UpdateCampaignInputSchema = z.object({
	campaignId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	campaign: CampaignSchema.omit({ dataInsercao: true, autorId: true }),
	segmentations: z.array(
		CampaignSegmentationSchema.omit({ campanhaId: true }).extend({
			id: z
				.string({
					required_error: "ID da segmentação da campanha não informado.",
					invalid_type_error: "Tipo não válido para o ID da segmentação da campanha.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar segmentação da campanha não informado.",
					invalid_type_error: "Tipo não válido para deletar segmentação da campanha.",
				})
				.optional(),
		}),
	),
});
export type TUpdateCampaignInput = z.infer<typeof UpdateCampaignInputSchema>;

export async function updateCampaign({ input, organizationId: userOrgId }: { input: TUpdateCampaignInput; organizationId: string }) {
	const campaignId = input.campaignId;

	// Validate recurrent campaign settings
	validateRecurrentCampaign(input.campaign as z.infer<typeof CampaignSchema>);
	validateSingleUseCampaign(input.campaign as z.infer<typeof CampaignSchema>);
	validateCashbackExpiringTrigger(input.campaign as z.infer<typeof CampaignSchema>);
	validateCampaignFrequencyInterval(input.campaign as z.infer<typeof CampaignSchema>);
	validateExecutionDelayDirection(input.campaign as z.infer<typeof CampaignSchema>);

	await validateProductPromotionCampaign(input.campaign as z.infer<typeof CampaignSchema>, userOrgId);

	// Validate template-trigger compatibility
	await validateCampaignTemplateTriggerCompatibility(input.campaign.whatsappTemplateId, input.campaign.gatilhoTipo, userOrgId);
	const organizationWeeklyLimit = await getOrganizationWeeklyCampaignLimit(userOrgId);
	validateCampaignWeeklyLimit({
		campaignWeeklyLimit: input.campaign.limiteEnviosSemanais,
		organizationWeeklyLimit,
	});

	// Validate cashback generation settings
	if (input.campaign.cashbackGeracaoAtivo) {
		if (!input.campaign.cashbackGeracaoTipo) {
			throw new createHttpError.BadRequest("Selecione o tipo de geração de cashback (FIXO ou PERCENTUAL).");
		}
		if (!input.campaign.cashbackGeracaoValor || input.campaign.cashbackGeracaoValor <= 0) {
			throw new createHttpError.BadRequest("Informe um valor válido para o cashback.");
		}
		// Validate PERCENTUAL is only used with sale-value triggers
		if (input.campaign.cashbackGeracaoTipo === "PERCENTUAL") {
			const validTriggersForPercentual = ["NOVA-COMPRA", "PRIMEIRA-COMPRA"];
			if (!validTriggersForPercentual.includes(input.campaign.gatilhoTipo)) {
				throw new createHttpError.BadRequest("Cashback percentual só pode ser usado com gatilhos NOVA-COMPRA ou PRIMEIRA-COMPRA.");
			}
		}
	}

	await validateCampaignCouponGenerationSettings(input.campaign, userOrgId);

	return await db.transaction(async (trx) => {
		console.log("[INFO] [UPDATE-CAMPAIGN] Starting to update campaign...", {
			campaignId,
			campaign: input.campaign,
			segmentations: input.segmentations,
		});
		const updatedCampaignResponse = await trx
			.update(campaigns)
			.set({ ...input.campaign, organizacaoId: userOrgId })
			.where(and(eq(campaigns.id, campaignId), eq(campaigns.organizacaoId, userOrgId)))
			.returning({ id: campaigns.id });

		const updatedCampaignId = updatedCampaignResponse[0]?.id;
		if (!updatedCampaignId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar campanha.");
		const preset = await trx.query.campaigns.findFirst({ where: and(eq(campaigns.id, updatedCampaignId), eq(campaigns.organizacaoId, userOrgId)), columns: { chavePreset: true } });
		if (preset?.chavePreset && typeof input.campaign.ativo === "boolean") {
			const journey = await getJourney({ executor: trx, organizationId: userOrgId, produto: "CRM" });
			if (journey) {
				const keys = new Set(journey.respostas.campanhasComEnvioHabilitado);
				if (input.campaign.ativo) keys.add(preset.chavePreset); else keys.delete(preset.chavePreset);
				await updateJourneyProgress({ executor: trx, organizationId: userOrgId, produto: "CRM", respostas: { campanhasComEnvioHabilitado: [...keys] } });
			}
			await reconcileOnboardingCampaigns({ executor: trx, organizationId: userOrgId });
		}

		console.log("[INFO] [UPDATE-CAMPAIGN] Campaign updated successfully, starting to process segmentations...");
		await handleSimpleChildRowsProcessing({
			trx: trx,
			table: campaignSegmentations,
			entities: input.segmentations,
			fatherEntityKey: "campanhaId",
			fatherEntityId: updatedCampaignId,
			organizacaoId: userOrgId,
		});

		return {
			data: {
				updatedId: updatedCampaignId,
			},
			message: "Campanha atualizada com sucesso.",
		};
	});
}
export type TUpdateCampaignOutput = Awaited<ReturnType<typeof updateCampaign>>;

const updateCampaignRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const input = await request.json();
	const parsedInput = UpdateCampaignInputSchema.parse(input);
	console.log("[INFO] [UPDATE-CAMPAIGN] Parsed input:", parsedInput);
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const result = await updateCampaign({ input: parsedInput, organizationId });
	return NextResponse.json(result, { status: 200 });
};
export const PUT = appApiHandler({
	PUT: updateCampaignRoute,
});
import { updateJourneyProgress } from "@/lib/onboarding/progress";
import { getJourney } from "@/lib/onboarding/progress";
import { reconcileOnboardingCampaigns } from "@/lib/onboarding/reconcile";

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { CampaignSchema, CampaignSegmentationSchema } from "@/schemas/campaigns";
import { db } from "@/services/drizzle";
import { campaignConversions, interactions } from "@/services/drizzle/schema";
import { campaignSegmentations, campaigns } from "@/services/drizzle/schema/campaigns";
import dayjs from "dayjs";
import { and, count, eq, gte, inArray, lte, or, sql, sum } from "drizzle-orm";
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

const CreateCampaignInputSchema = z.object({
	campaign: CampaignSchema.omit({ dataInsercao: true, autorId: true }),
	segmentations: z.array(CampaignSegmentationSchema.omit({ campanhaId: true })),
});
export type TCreateCampaignInput = z.infer<typeof CreateCampaignInputSchema>;

async function createCampaign({ input, session }: { input: TCreateCampaignInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	// Doing some validations before starting the process
	if (
		input.campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO" &&
		(!input.campaign.gatilhoTempoPermanenciaMedida || !input.campaign.gatilhoTempoPermanenciaValor)
	) {
		throw new createHttpError.BadRequest("Define um tempo de permanência para a segmentação.");
	}

	// Validate recurrent campaign settings
	validateRecurrentCampaign(input.campaign as z.infer<typeof CampaignSchema>);

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

	const insertedCampaignResponse = await db
		.insert(campaigns)
		.values({ ...input.campaign, organizacaoId: userOrgId, autorId: session.user.id })
		.returning({ id: campaigns.id });

	const insertedCampaignId = insertedCampaignResponse[0]?.id;
	if (!insertedCampaignId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar campanha.");

	if (input.segmentations.length > 0)
		await db
			.insert(campaignSegmentations)
			.values(input.segmentations.map((segmentation) => ({ ...segmentation, campanhaId: insertedCampaignId, organizacaoId: userOrgId })));

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
	const result = await createCampaign({ input: parsedInput, session: session });
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
	if (input.activeOnly && input.activeOnly) {
		conditions.push(eq(campaigns.ativo, true));
	}

	const campaignsResult = await db.query.campaigns.findMany({
		where: and(...conditions),
		with: {
			segmentacoes: true,
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
	];
	if (input.statsPeriodAfter) interactionsConditions.push(gte(interactions.dataInsercao, input.statsPeriodAfter));
	if (input.statsPeriodBefore) interactionsConditions.push(lte(interactions.dataInsercao, input.statsPeriodBefore));

	const interactionsStats = await db
		.select({
			campaignId: interactions.campanhaId,
			sentCount: count(interactions.id),
			deliveredCount: sum(sql<number>`CASE WHEN ${interactions.statusEnvio} IN ('DELIVERED', 'READ') THEN 1 ELSE 0 END`),
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
	const input = GetCampaignsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		activeOnly: searchParams.get("activeOnly") ?? undefined,
		statsPeriodAfter: searchParams.get("statsPeriodAfter") ?? undefined,
		statsPeriodBefore: searchParams.get("statsPeriodBefore") ?? undefined,
	});
	const result = await getCampaigns({ input, session: session });
	return NextResponse.json(result, { status: 200 });
};
export const GET = appApiHandler({
	GET: getCampaignsRoute,
});

const UpdateCampaignInputSchema = z.object({
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

async function updateCampaign({ input, session }: { input: TUpdateCampaignInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const campaignId = input.campaignId;

	// Validate recurrent campaign settings
	validateRecurrentCampaign(input.campaign as z.infer<typeof CampaignSchema>);

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
	const result = await updateCampaign({ input: parsedInput, session: session });
	return NextResponse.json(result, { status: 200 });
};
export const PUT = appApiHandler({
	PUT: updateCampaignRoute,
});

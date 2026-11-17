import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { countIncrementalConversionsExpr, sumIncrementalRevenueExpr } from "@/lib/conversions/incremental";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, count, eq, gte, inArray, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCampaignStatsOverallInputSchema = z.object({
	startDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	endDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
});
export type TGetCampaignStatsOverallInput = z.infer<typeof GetCampaignStatsOverallInputSchema>;

async function getCampaignStatsOverall({ input, session }: { input: TGetCampaignStatsOverallInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	let startDate = input.startDate;
	const endDate = input.endDate ?? new Date();

	if (!startDate) {
		const firstInteraction = await db
			.select({
				date: interactions.dataEnvio,
			})
			.from(interactions)
			.where(eq(interactions.organizacaoId, userOrgId))
			.orderBy(asc(interactions.dataEnvio))
			.limit(1);
		startDate = firstInteraction[0]?.date ?? dayjs().subtract(30, "day").toDate();
	}

	// Get all campaigns for this organization
	const allCampaigns = await db.query.campaigns.findMany({
		where: eq(campaigns.organizacaoId, userOrgId),
		columns: {
			id: true,
			titulo: true,
			gatilhoTipo: true,
			ativo: true,
		},
	});

	// Get interactions count per campaign in the date range
	const interactionsPerCampaign = await db
		.select({
			campanhaId: interactions.campanhaId,
			total: count(interactions.id),
		})
		.from(interactions)
		.where(
			and(
				eq(interactions.organizacaoId, userOrgId),
				eq(interactions.tipo, "ENVIO-MENSAGEM"),
				inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES]),
				gte(interactions.dataEnvio, startDate),
				lte(interactions.dataEnvio, endDate),
			),
		)
		.groupBy(interactions.campanhaId);

	const interactionsMap = new Map(interactionsPerCampaign.map((i) => [i.campanhaId, i.total]));

	// Get conversions per campaign in the date range
	const conversionsPerCampaign = await db
		.select({
			campanhaId: campaignConversions.campanhaId,
			total: count(campaignConversions.id),
			receitaTotal: sum(campaignConversions.atribuicaoReceita),
			receitaIncremental: sumIncrementalRevenueExpr,
			conversoesIncrementais: countIncrementalConversionsExpr,
		})
		.from(campaignConversions)
		.where(
			and(
				eq(campaignConversions.organizacaoId, userOrgId),
				gte(campaignConversions.dataConversao, startDate),
				lte(campaignConversions.dataConversao, endDate),
			),
		)
		.groupBy(campaignConversions.campanhaId);

	const conversionsMap = new Map(
		conversionsPerCampaign.map((c) => [
			c.campanhaId,
			{
				total: c.total,
				receita: Number(c.receitaTotal ?? 0),
				receitaIncremental: Number(c.receitaIncremental ?? 0),
				conversoesIncrementais: Number(c.conversoesIncrementais ?? 0),
			},
		]),
	);

	// Build campaign analytics
	const campanhasAnalytics = allCampaigns.map((campaign) => {
		const interacoes = interactionsMap.get(campaign.id) ?? 0;
		const conversionData = conversionsMap.get(campaign.id) ?? { total: 0, receita: 0, receitaIncremental: 0, conversoesIncrementais: 0 };
		const taxaConversao = interacoes > 0 ? (conversionData.total / interacoes) * 100 : 0;

		return {
			id: campaign.id,
			titulo: campaign.titulo,
			gatilhoTipo: campaign.gatilhoTipo,
			ativo: campaign.ativo,
			interacoes,
			conversoes: conversionData.total,
			conversoesIncrementais: conversionData.conversoesIncrementais,
			taxaConversao: Math.round(taxaConversao * 100) / 100,
			receitaTotal: conversionData.receita,
			receitaIncremental: Math.round(conversionData.receitaIncremental * 100) / 100,
		};
	});

	// Sort by revenue descending
	campanhasAnalytics.sort((a, b) => b.receitaTotal - a.receitaTotal);

	// Calculate totals
	const totais = {
		campanhas: allCampaigns.length,
		campanhasAtivas: allCampaigns.filter((c) => c.ativo).length,
		interacoes: campanhasAnalytics.reduce((acc, c) => acc + c.interacoes, 0),
		conversoes: campanhasAnalytics.reduce((acc, c) => acc + c.conversoes, 0),
		conversoesIncrementais: campanhasAnalytics.reduce((acc, c) => acc + c.conversoesIncrementais, 0),
		receita: campanhasAnalytics.reduce((acc, c) => acc + c.receitaTotal, 0),
		receitaIncremental: Math.round(campanhasAnalytics.reduce((acc, c) => acc + c.receitaIncremental, 0) * 100) / 100,
	};

	const taxaConversaoGeral = totais.interacoes > 0 ? (totais.conversoes / totais.interacoes) * 100 : 0;

	return {
		data: {
			campanhas: campanhasAnalytics,
			totais: {
				...totais,
				taxaConversaoGeral: Math.round(taxaConversaoGeral * 100) / 100,
			},
			periodoInicio: startDate,
			periodoFim: endDate,
		},
		message: "Analytics das campanhas recuperadas com sucesso.",
	};
}
export type TGetCampaignStatsOverallOutput = Awaited<ReturnType<typeof getCampaignStatsOverall>>;

const getCampaignStatsOverallRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	assertCanViewCampaigns(session);

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignStatsOverallInputSchema.parse({
		startDate: searchParams.get("startDate") ?? undefined,
		endDate: searchParams.get("endDate") ?? undefined,
	});

	const result = await getCampaignStatsOverall({ input, session: session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignStatsOverallRoute,
});

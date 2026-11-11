import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "@/lib/campaigns/utils";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, interactions } from "@/services/drizzle/schema";
import { and, count, eq, gte, inArray, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCampaignRankingInputSchema = z.object({
	startDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	endDate: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingStartDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Tipo inválido para período de comparação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	comparingEndDate: z
		.string({
			required_error: "Período de comparação não informado.",
			invalid_type_error: "Tipo inválido para período de comparação.",
		})
		.datetime({ message: "Tipo inválido para período de comparação." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	rankingBy: z.enum(["revenue", "conversions", "conversion-rate"]).optional().nullable(),
});
export type TGetCampaignRankingInput = z.infer<typeof GetCampaignRankingInputSchema>;

async function fetchRankingForPeriod({
	startDate,
	endDate,
	rankingBy,
	userOrgId,
}: {
	startDate: Date | null;
	endDate: Date | null;
	rankingBy: "revenue" | "conversions" | "conversion-rate" | null | undefined;
	userOrgId: string;
}) {
	// Get all campaigns
	// A campaign created after the period did not exist in it, so it gets no position there.
	const allCampaigns = await db.query.campaigns.findMany({
		where: and(eq(campaigns.organizacaoId, userOrgId), endDate ? lte(campaigns.dataInsercao, endDate) : undefined),
		columns: {
			id: true,
			titulo: true,
			ativo: true,
			gatilhoTipo: true,
		},
	});

	// Build interaction conditions
	const interactionConditions = [
		eq(interactions.organizacaoId, userOrgId),
		eq(interactions.tipo, "ENVIO-MENSAGEM"),
		inArray(interactions.statusEnvio, [...CAMPAIGN_SENT_INTERACTION_STATUSES]),
	];
	if (startDate) interactionConditions.push(gte(interactions.dataEnvio, startDate));
	if (endDate) interactionConditions.push(lte(interactions.dataEnvio, endDate));

	// Get interactions per campaign grouped by statusEnvio to compute taxaEntrega/taxaLeitura
	const interactionsData = await db
		.select({
			campanhaId: interactions.campanhaId,
			statusEnvio: interactions.statusEnvio,
			total: count(interactions.id),
		})
		.from(interactions)
		.where(and(...interactionConditions))
		.groupBy(interactions.campanhaId, interactions.statusEnvio);

	// Build map: campanhaId -> { enviados, entregues, lidos }
	const interactionsMap = new Map<string, { enviados: number; entregues: number; lidos: number }>();
	for (const row of interactionsData) {
		if (!row.campanhaId) continue;
		if (!interactionsMap.has(row.campanhaId)) {
			interactionsMap.set(row.campanhaId, { enviados: 0, entregues: 0, lidos: 0 });
		}
		const entry = interactionsMap.get(row.campanhaId)!;
		const n = Number(row.total);
		entry.enviados += n;
		if (row.statusEnvio === "ENTREGUE" || row.statusEnvio === "LIDO") entry.entregues += n;
		if (row.statusEnvio === "LIDO") entry.lidos += n;
	}

	// Build conversion conditions
	const conversionConditions = [eq(campaignConversions.organizacaoId, userOrgId)];
	if (startDate) conversionConditions.push(gte(campaignConversions.dataConversao, startDate));
	if (endDate) conversionConditions.push(lte(campaignConversions.dataConversao, endDate));

	// Get conversions per campaign
	const conversionsData = await db
		.select({
			campanhaId: campaignConversions.campanhaId,
			totalConversions: count(campaignConversions.id),
			totalRevenue: sum(campaignConversions.atribuicaoReceita),
		})
		.from(campaignConversions)
		.where(and(...conversionConditions))
		.groupBy(campaignConversions.campanhaId);

	const conversionsMap = new Map(
		conversionsData.map((c) => [
			c.campanhaId,
			{
				conversions: Number(c.totalConversions),
				revenue: Number(c.totalRevenue ?? 0),
			},
		]),
	);

	// Build campaign stats
	const campaignStats = allCampaigns.map((campaign) => {
		const counts = interactionsMap.get(campaign.id) ?? { enviados: 0, entregues: 0, lidos: 0 };
		const interacoes = counts.enviados;
		const conversionData = conversionsMap.get(campaign.id) ?? { conversions: 0, revenue: 0 };
		const taxaConversao = interacoes > 0 ? (conversionData.conversions / interacoes) * 100 : 0;
		const taxaEntrega = interacoes > 0 ? (counts.entregues / interacoes) * 100 : 0;
		const taxaLeitura = counts.entregues > 0 ? (counts.lidos / counts.entregues) * 100 : 0;

		return {
			campanhaId: campaign.id,
			titulo: campaign.titulo,
			ativo: campaign.ativo,
			gatilhoTipo: campaign.gatilhoTipo,
			interacoes,
			conversoes: conversionData.conversions,
			receita: conversionData.revenue,
			taxaConversao: Math.round(taxaConversao * 100) / 100,
			taxaEntrega: Math.round(taxaEntrega * 100) / 100,
			taxaLeitura: Math.round(taxaLeitura * 100) / 100,
		};
	});

	// Sort based on ranking criteria
	const sortedStats = [...campaignStats];
	if (rankingBy === "revenue") {
		sortedStats.sort((a, b) => b.receita - a.receita);
	} else if (rankingBy === "conversions") {
		sortedStats.sort((a, b) => b.conversoes - a.conversoes);
	} else if (rankingBy === "conversion-rate") {
		sortedStats.sort((a, b) => b.taxaConversao - a.taxaConversao);
	} else {
		// Default to revenue
		sortedStats.sort((a, b) => b.receita - a.receita);
	}

	// Every campaign is ranked (the overview shows the full table), so the comparison period
	// also has a position for each one and `rankDelta` is only null for campaigns that did not exist.
	return sortedStats.map((item, index) => ({
		...item,
		rank: index + 1,
	}));
}

async function getCampaignRanking({ input, session }: { input: TGetCampaignRankingInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { startDate, endDate, comparingStartDate, comparingEndDate, rankingBy } = input;

	// Fetch current period ranking
	const currentRanking = await fetchRankingForPeriod({
		startDate,
		endDate,
		rankingBy,
		userOrgId,
	});

	// If no comparison period, return current ranking without comparison fields
	if (!comparingStartDate || !comparingEndDate) {
		return {
			data: currentRanking.map((item) => ({
				...item,
				rankComparison: null,
				rankDelta: null,
				interacoesComparison: null,
				conversoesComparison: null,
				receitaComparison: null,
				taxaConversaoComparison: null,
				taxaEntregaComparison: null,
				taxaLeituraComparison: null,
			})),
			message: "Ranking de campanhas recuperado com sucesso.",
		};
	}

	// Fetch comparison period ranking
	const comparisonRanking = await fetchRankingForPeriod({
		startDate: comparingStartDate,
		endDate: comparingEndDate,
		rankingBy,
		userOrgId,
	});

	// Create a map of campanhaId -> comparison data for quick lookup
	const comparisonMap = new Map(
		comparisonRanking.map((item) => [
			item.campanhaId,
			{
				rank: item.rank,
				interacoes: item.interacoes,
				conversoes: item.conversoes,
				receita: item.receita,
				taxaConversao: item.taxaConversao,
				taxaEntrega: item.taxaEntrega,
				taxaLeitura: item.taxaLeitura,
			},
		]),
	);

	// Merge current ranking with comparison data
	const enrichedRanking = currentRanking.map((item) => {
		const comparisonData = comparisonMap.get(item.campanhaId);
		const rankComparison = comparisonData?.rank ?? null;
		const rankDelta = rankComparison !== null ? rankComparison - item.rank : null;

		return {
			...item,
			rankComparison,
			rankDelta,
			interacoesComparison: comparisonData?.interacoes ?? null,
			conversoesComparison: comparisonData?.conversoes ?? null,
			receitaComparison: comparisonData?.receita ?? null,
			taxaConversaoComparison: comparisonData?.taxaConversao ?? null,
			taxaEntregaComparison: comparisonData?.taxaEntrega ?? null,
			taxaLeituraComparison: comparisonData?.taxaLeitura ?? null,
		};
	});

	return {
		data: enrichedRanking,
		message: "Ranking de campanhas recuperado com sucesso.",
	};
}

export type TGetCampaignRankingOutput = Awaited<ReturnType<typeof getCampaignRanking>>;

const getCampaignRankingRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignRankingInputSchema.parse({
		startDate: searchParams.get("startDate") ?? null,
		endDate: searchParams.get("endDate") ?? null,
		comparingStartDate: searchParams.get("comparingStartDate") ?? null,
		comparingEndDate: searchParams.get("comparingEndDate") ?? null,
		rankingBy: (searchParams.get("rankingBy") as "revenue" | "conversions" | "conversion-rate" | undefined) ?? "revenue",
	});

	const result = await getCampaignRanking({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignRankingRoute,
});

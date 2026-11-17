import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, campaignSegmentations } from "@/services/drizzle/schema";
import { and, count, eq, gte, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetStatsBySegmentationInputSchema = z.object({
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
});
export type TGetStatsBySegmentationInput = z.infer<typeof GetStatsBySegmentationInputSchema>;

async function getStatsBySegmentation({ input, session }: { input: TGetStatsBySegmentationInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { startDate, endDate } = input;

	// Get all segmentations with their campaign IDs
	const segmentationsData = await db.query.campaignSegmentations.findMany({
		where: eq(campaignSegmentations.organizacaoId, userOrgId),
		columns: {
			id: true,
			campanhaId: true,
			segmentacao: true,
		},
	});

	// Get all campaigns to check active status
	const allCampaigns = await db.query.campaigns.findMany({
		where: eq(campaigns.organizacaoId, userOrgId),
		columns: {
			id: true,
			ativo: true,
		},
	});

	const campaignActiveMap = new Map(allCampaigns.map((c) => [c.id, c.ativo]));

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

	// Build segmentation -> campaigns map
	const segmentationCampaignsMap = new Map<string, Set<string>>();
	for (const seg of segmentationsData) {
		if (!segmentationCampaignsMap.has(seg.segmentacao)) {
			segmentationCampaignsMap.set(seg.segmentacao, new Set());
		}
		segmentationCampaignsMap.get(seg.segmentacao)!.add(seg.campanhaId);
	}

	// Aggregate stats by segmentation
	const segmentationStats: Array<{
		segmentacao: string;
		campanhasAtivas: number;
		conversoes: number;
		receita: number;
	}> = [];

	for (const [segmentacao, campaignIds] of segmentationCampaignsMap.entries()) {
		let campanhasAtivas = 0;
		let conversoes = 0;
		let receita = 0;

		for (const campaignId of campaignIds) {
			// Check if campaign is active
			if (campaignActiveMap.get(campaignId)) {
				campanhasAtivas++;
			}

			// Get conversion data
			const conversionData = conversionsMap.get(campaignId);
			if (conversionData) {
				conversoes += conversionData.conversions;
				receita += conversionData.revenue;
			}
		}

		segmentationStats.push({
			segmentacao,
			campanhasAtivas,
			conversoes,
			receita,
		});
	}

	// Sort by revenue descending
	segmentationStats.sort((a, b) => b.receita - a.receita);

	return {
		data: segmentationStats,
		message: "Estatísticas por segmentação recuperadas com sucesso.",
	};
}

export type TGetStatsBySegmentationOutput = Awaited<ReturnType<typeof getStatsBySegmentation>>;

const getStatsBySegmentationRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	assertCanViewCampaigns(session);

	const searchParams = request.nextUrl.searchParams;
	const input = GetStatsBySegmentationInputSchema.parse({
		startDate: searchParams.get("startDate") ?? null,
		endDate: searchParams.get("endDate") ?? null,
	});

	const result = await getStatsBySegmentation({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getStatsBySegmentationRoute,
});

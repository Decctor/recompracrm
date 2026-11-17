import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import { GetCampaignStatsInputSchema, getCampaignStats } from "@/lib/campaigns/stats";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

export type { TGetCampaignStatsInput, TGetCampaignStatsOutput } from "@/lib/campaigns/stats";

const getCampaignStatsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	assertCanViewCampaigns(session);

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignStatsInputSchema.parse({
		campaignId: searchParams.get("campaignId"),
		startDate: searchParams.get("startDate") ?? undefined,
		endDate: searchParams.get("endDate") ?? undefined,
	});

	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const result = await getCampaignStats({ input, organizacaoId });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignStatsRoute,
});

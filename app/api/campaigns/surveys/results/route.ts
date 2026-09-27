import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { GetCampaignSurveyResultsInputSchema, getCampaignSurveyResults } from "@/lib/campaigns/surveys/results";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

export type { TGetCampaignSurveyResultsInput, TGetCampaignSurveyResultsOutput } from "@/lib/campaigns/surveys/results";

const getCampaignSurveyResultsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetCampaignSurveyResultsInputSchema.parse({ campaignId: request.nextUrl.searchParams.get("campaignId") });
	const result = await getCampaignSurveyResults({ input, organizationId });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignSurveyResultsRoute,
});

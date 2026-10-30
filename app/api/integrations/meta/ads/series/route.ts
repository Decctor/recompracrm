import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { fetchMetaAdsDailySeries } from "@/lib/integrations/meta/ads/insights";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetMetaAdsSeriesInputSchema = MetaAdsPeriodInputSchema.extend({
	// Campanha, conjunto ou anúncio. Sem ele, a série é da conta inteira.
	objectId: z.string({ invalid_type_error: "Tipo inválido para o ID da entidade." }).optional().nullable(),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsSeriesInput = z.infer<typeof GetMetaAdsSeriesInputSchema>;

async function getMetaAdsSeries({ input, organizacaoId }: { input: TGetMetaAdsSeriesInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });
	const [current, comparing] = await withMetaAdsAccessTracking(integrationId, () =>
		Promise.all([
			fetchMetaAdsDailySeries({ config, ...input.period, objectId: input.objectId }),
			input.comparing ? fetchMetaAdsDailySeries({ config, ...input.comparing, objectId: input.objectId }) : Promise.resolve(null),
		]),
	);
	return { data: { current, comparing }, message: "Série diária buscada com sucesso." };
}
export type TGetMetaAdsSeriesOutput = Awaited<ReturnType<typeof getMetaAdsSeries>>;

async function getMetaAdsSeriesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar as métricas do Meta Ads.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsSeriesInputSchema.parse({ ...readMetaAdsPeriodParams(searchParams), objectId: searchParams.get("objectId") });
	const result = await getMetaAdsSeries({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsSeriesRoute });

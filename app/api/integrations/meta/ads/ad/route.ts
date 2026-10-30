import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { getCatalogAd } from "@/lib/integrations/meta/ads/catalog-read";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { fetchMetaAdsAdRankings, fetchMetaAdsDailySeries, fetchMetaAdsRichTotals } from "@/lib/integrations/meta/ads/insights";
import { fetchMetaAdsVideoSource } from "@/lib/integrations/meta/ads/library";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetMetaAdsAdInputSchema = MetaAdsPeriodInputSchema.extend({
	id: z.string({ required_error: "ID do anúncio não informado.", invalid_type_error: "Tipo inválido para o ID do anúncio." }),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsAdInput = z.infer<typeof GetMetaAdsAdInputSchema>;

/** Identidade e criativo do catálogo; métricas, rankings e a fonte do vídeo ao vivo. */
async function getMetaAdsAd({ input, organizacaoId }: { input: TGetMetaAdsAdInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });
	const ad = await getCatalogAd({ integrationId, adId: input.id });

	const [summary, daily, comparing, rankings, video] = await withMetaAdsAccessTracking(integrationId, () =>
		Promise.all([
			fetchMetaAdsRichTotals({ config, ...input.period, objectId: input.id }),
			fetchMetaAdsDailySeries({ config, ...input.period, objectId: input.id }),
			input.comparing ? fetchMetaAdsRichTotals({ config, ...input.comparing, objectId: input.id }) : Promise.resolve(null),
			fetchMetaAdsAdRankings({ config, ...input.period, adId: input.id }),
			ad?.videoId ? fetchMetaAdsVideoSource({ config, videoId: ad.videoId }) : Promise.resolve(null),
		]),
	);

	return {
		data: { byId: { adId: input.id, ad, summary, daily, comparing, rankings, video } },
		message: "Detalhe do anúncio buscado com sucesso.",
	};
}
export type TGetMetaAdsAdOutput = Awaited<ReturnType<typeof getMetaAdsAd>>;

async function getMetaAdsAdRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar o detalhe do anúncio.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsAdInputSchema.parse({ ...readMetaAdsPeriodParams(searchParams), id: searchParams.get("id") });
	const result = await getMetaAdsAd({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsAdRoute });

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { type TMediaAdView, listCatalogAds } from "@/lib/integrations/meta/ads/catalog-read";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { fetchMetaAdsRichEntities } from "@/lib/integrations/meta/ads/insights";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import type { TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetMetaAdsHierarchyInputSchema = MetaAdsPeriodInputSchema.extend({
	campaignId: z.string({ required_error: "ID da campanha não informado.", invalid_type_error: "Tipo inválido para o ID da campanha." }),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsHierarchyInput = z.infer<typeof GetMetaAdsHierarchyInputSchema>;

type THierarchyAd = {
	adId: string;
	adName: string;
	/** Linha do catálogo; `null` quando o anúncio ainda não foi sincronizado. */
	ad: TMediaAdView | null;
	metrics: TMetaAdsRichMetrics | null;
};

type THierarchyAdSet = {
	adsetId: string;
	adsetName: string | null;
	adsetStatus: string | null;
	metrics: TMetaAdsRichMetrics | null;
	ads: THierarchyAd[];
};

const bySpend = (a: { metrics: TMetaAdsRichMetrics | null }, b: { metrics: TMetaAdsRichMetrics | null }) =>
	(b.metrics?.spend ?? -1) - (a.metrics?.spend ?? -1);

/**
 * Conjuntos e anúncios de uma campanha. O esqueleto vem do catálogo, então anúncios sem entrega no
 * período também aparecem; as métricas vêm ao vivo, cada nível com sua própria chamada — o alcance e
 * o ROAS de um conjunto não se reconstroem somando os anúncios.
 */
async function getMetaAdsHierarchy({ input, organizacaoId }: { input: TGetMetaAdsHierarchyInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });
	const [catalogAds, adsets, ads] = await Promise.all([
		listCatalogAds({ integrationId, campaignId: input.campaignId }),
		withMetaAdsAccessTracking(integrationId, () =>
			fetchMetaAdsRichEntities({ config, level: "adset", ...input.period, campaignId: input.campaignId, includeVideo: false }),
		),
		withMetaAdsAccessTracking(integrationId, () =>
			fetchMetaAdsRichEntities({ config, level: "ad", ...input.period, campaignId: input.campaignId, includeVideo: false }),
		),
	]);

	const adsetMetrics = new Map(adsets.map((entity) => [entity.adsetId ?? "", entity]));
	const adMetrics = new Map(ads.map((entity) => [entity.adId ?? "", entity]));
	const tree = new Map<string, THierarchyAdSet>();

	const ensureAdSet = (adsetId: string, name: string | null, status: string | null) => {
		let node = tree.get(adsetId);
		if (!node) {
			node = {
				adsetId,
				adsetName: name ?? adsetMetrics.get(adsetId)?.adsetName ?? null,
				adsetStatus: status,
				metrics: adsetMetrics.get(adsetId)?.metrics ?? null,
				ads: [],
			};
			tree.set(adsetId, node);
		}
		return node;
	};

	const seenAds = new Set<string>();
	for (const ad of catalogAds) {
		if (!ad.conjuntoId) continue;
		seenAds.add(ad.anuncioId);
		ensureAdSet(ad.conjuntoId, ad.conjuntoNome, ad.conjuntoStatus).ads.push({
			adId: ad.anuncioId,
			adName: ad.anuncioNome,
			ad,
			metrics: adMetrics.get(ad.anuncioId)?.metrics ?? null,
		});
	}
	// Anúncio com entrega que o catálogo ainda não tem (criado depois da última sincronização).
	for (const entity of ads) {
		if (!entity.adId || !entity.adsetId || seenAds.has(entity.adId)) continue;
		ensureAdSet(entity.adsetId, entity.adsetName ?? null, null).ads.push({
			adId: entity.adId,
			adName: entity.adName ?? "Anúncio",
			ad: null,
			metrics: entity.metrics,
		});
	}

	const nodes = [...tree.values()].map((node) => ({ ...node, ads: node.ads.sort(bySpend) })).sort(bySpend);
	return { data: { adsets: nodes }, message: "Estrutura da campanha buscada com sucesso." };
}
export type TGetMetaAdsHierarchyOutput = Awaited<ReturnType<typeof getMetaAdsHierarchy>>;

async function getMetaAdsHierarchyRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar as métricas do Meta Ads.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsHierarchyInputSchema.parse({ ...readMetaAdsPeriodParams(searchParams), campaignId: searchParams.get("campaignId") });
	const result = await getMetaAdsHierarchy({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsHierarchyRoute });

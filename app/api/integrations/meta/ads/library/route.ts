import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewIntegrations } from "@/lib/integrations/mask";
import { MEDIA_AD_STATUS_GROUPS, type TMediaAdView, listCatalogAds, listCatalogCampaigns } from "@/lib/integrations/meta/ads/catalog-read";
import { resolveMetaAdsIntegration, withMetaAdsAccessTracking } from "@/lib/integrations/meta/ads/config";
import { fetchMetaAdsRichEntities } from "@/lib/integrations/meta/ads/insights";
import { MetaAdsPeriodInputSchema, readMetaAdsPeriodParams, resolveMetaAdsPeriods } from "@/lib/integrations/meta/ads/period-input";
import type { TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import { MediaAdMediaTypeEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const LIBRARY_SORTS = ["spend", "results", "costPerResult", "ctr", "roas", "recent", "name"] as const;
const RESULT_KEYS = ["purchases", "leads", "messagingConversationsStarted"] as const;

const GetMetaAdsLibraryInputSchema = MetaAdsPeriodInputSchema.extend({
	status: z
		.enum(["all", ...(Object.keys(MEDIA_AD_STATUS_GROUPS) as [keyof typeof MEDIA_AD_STATUS_GROUPS])], {
			invalid_type_error: "Tipo inválido para o status.",
		})
		.optional()
		.nullable()
		.transform((v) => v ?? "all"),
	campaignId: z.string({ invalid_type_error: "Tipo inválido para o ID da campanha." }).optional().nullable(),
	mediaType: MediaAdMediaTypeEnum.optional().nullable(),
	search: z.string({ invalid_type_error: "Tipo inválido para a busca." }).optional().nullable(),
	sort: z
		.enum(LIBRARY_SORTS, { invalid_type_error: "Tipo inválido para a ordenação." })
		.optional()
		.nullable()
		.transform((v) => v ?? "spend"),
	// Resultado principal da conta, usado nas ordenações por resultado e custo por resultado.
	resultKey: z
		.enum(RESULT_KEYS, { invalid_type_error: "Tipo inválido para o resultado." })
		.optional()
		.nullable()
		.transform((v) => v ?? "purchases"),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.max(1, Number(v)) : 1)),
	pageSize: z
		.string({ invalid_type_error: "Tipo inválido para o tamanho da página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(1, Number(v)), 100) : 24)),
}).transform(resolveMetaAdsPeriods);
export type TGetMetaAdsLibraryInput = z.infer<typeof GetMetaAdsLibraryInputSchema>;

type TLibraryAd = TMediaAdView & { metrics: TMetaAdsRichMetrics | null };

/** Valor de ordenação de um anúncio. `null` (sem entrega) vai sempre para o fim, em qualquer direção. */
function sortValue(ad: TLibraryAd, sort: TGetMetaAdsLibraryInput["sort"], resultKey: TGetMetaAdsLibraryInput["resultKey"]): number | null {
	const metrics = ad.metrics;
	switch (sort) {
		case "spend":
			return metrics?.spend ?? null;
		case "results":
			return metrics ? metrics[resultKey] : null;
		case "costPerResult":
			return metrics && metrics[resultKey] > 0 ? metrics.spend / metrics[resultKey] : null;
		case "ctr":
			return metrics?.ctr ?? null;
		case "roas":
			return metrics?.purchaseRoas ?? null;
		default:
			return null;
	}
}

function sortAds(ads: TLibraryAd[], input: TGetMetaAdsLibraryInput): TLibraryAd[] {
	if (input.sort === "recent") return ads;
	if (input.sort === "name") return [...ads].sort((a, b) => a.anuncioNome.localeCompare(b.anuncioNome, "pt-BR"));
	// Custo: menor é melhor. O resto: maior primeiro.
	const direction = input.sort === "costPerResult" ? 1 : -1;
	return [...ads].sort((a, b) => {
		const va = sortValue(a, input.sort, input.resultKey);
		const vb = sortValue(b, input.sort, input.resultKey);
		if (va == null && vb == null) return 0;
		if (va == null) return 1;
		if (vb == null) return -1;
		return (va - vb) * direction;
	});
}

async function getMetaAdsLibrary({ input, organizacaoId }: { input: TGetMetaAdsLibraryInput; organizacaoId: string }) {
	const { integrationId, config } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });

	const [catalogAds, campaigns, insights] = await Promise.all([
		listCatalogAds({
			integrationId,
			statusGroup: input.status === "all" ? null : input.status,
			campaignId: input.campaignId,
			mediaType: input.mediaType,
			search: input.search,
		}),
		listCatalogCampaigns(integrationId),
		// Uma chamada traz todos os anúncios com entrega no período; o cruzamento é por id.
		withMetaAdsAccessTracking(integrationId, () =>
			fetchMetaAdsRichEntities({ config, level: "ad", ...input.period, campaignId: input.campaignId, includeVideo: false }),
		),
	]);
	const metricsByAdId = new Map(insights.map((entity) => [entity.adId ?? "", entity.metrics]));
	const sorted = sortAds(
		catalogAds.map((ad) => ({ ...ad, metrics: metricsByAdId.get(ad.anuncioId) ?? null })),
		input,
	);

	const total = sorted.length;
	const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
	const offset = (input.page - 1) * input.pageSize;
	const catalogState = config.catalogo;

	return {
		data: {
			ads: sorted.slice(offset, offset + input.pageSize),
			pagination: { page: input.page, pageSize: input.pageSize, total, totalPages },
			campaigns,
			catalog: {
				// Conta recém-conectada: o catálogo ainda não foi lido. A UI mostra o estado próprio.
				pending: !catalogState?.ultimaTentativaEm,
				lastAttemptAt: catalogState?.ultimaTentativaEm ?? null,
				adsCount: catalogState?.anuncios ?? 0,
				truncated: catalogState?.truncado ?? false,
			},
		},
		message: "Biblioteca de anúncios buscada com sucesso.",
	};
}
export type TGetMetaAdsLibraryOutput = Awaited<ReturnType<typeof getMetaAdsLibrary>>;
export type TMetaAdsLibraryItem = TGetMetaAdsLibraryOutput["data"]["ads"][number];

async function getMetaAdsLibraryRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar a biblioteca de anúncios.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canViewIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetMetaAdsLibraryInputSchema.parse({
		...readMetaAdsPeriodParams(searchParams),
		status: searchParams.get("status"),
		campaignId: searchParams.get("campaignId"),
		mediaType: searchParams.get("mediaType"),
		search: searchParams.get("search"),
		sort: searchParams.get("sort"),
		resultKey: searchParams.get("resultKey"),
		page: searchParams.get("page"),
		pageSize: searchParams.get("pageSize"),
	});
	const result = await getMetaAdsLibrary({ input, organizacaoId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getMetaAdsLibraryRoute });

import type { TGetMetaAdsAdOutput } from "@/app/api/integrations/meta/ads/ad/route";
import type { TGetMetaAdsBreakdownsOutput } from "@/app/api/integrations/meta/ads/breakdowns/route";
import type { TGetMetaAdsHierarchyOutput } from "@/app/api/integrations/meta/ads/hierarchy/route";
import type { TGetMetaAdsInsightsOutput } from "@/app/api/integrations/meta/ads/insights/route";
import type { TGetMetaAdsLibraryOutput } from "@/app/api/integrations/meta/ads/library/route";
import type { TGetMetaAdsSeriesOutput } from "@/app/api/integrations/meta/ads/series/route";
import type { TMediaAdStatusGroup } from "@/lib/integrations/meta/ads/catalog-read";
import type { TMetaAdsBreakdownType } from "@/lib/integrations/meta/ads/types";
import type { TMetaResultKey } from "@/lib/paid-media/format";
import type { TMediaAdMediaTypeEnum } from "@/schemas/enums";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";

/**
 * Escopo comum a todas as consultas da página de Mídia paga. As chaves de query são montadas a partir
 * dele, então a página e o painel de detalhe compartilham a cache: abrir um item não refaz a busca.
 */
export type TMetaAdsScope = {
	integrationId: string | null;
	since: string;
	until: string;
	comparingSince?: string | null;
	comparingUntil?: string | null;
};

/** As métricas mudam pouco em um minuto, e cada busca gasta cota da Meta. */
const META_ADS_STALE_TIME = 60_000;

function scopeKey(scope: TMetaAdsScope) {
	return [scope.integrationId ?? "", scope.since, scope.until, scope.comparingSince ?? "", scope.comparingUntil ?? ""] as const;
}

function buildParams(params: Record<string, string | number | null | undefined>) {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
	}
	return search.toString();
}

function scopeParams(scope: TMetaAdsScope) {
	return {
		integrationId: scope.integrationId,
		since: scope.since,
		until: scope.until,
		comparingSince: scope.comparingSince,
		comparingUntil: scope.comparingUntil,
	};
}

/* ------------------------------- Insights ------------------------------- */

type TInsightsLevel = "account" | "campaign" | "adset" | "ad";

async function fetchMetaAdsInsights(scope: TMetaAdsScope, level: TInsightsLevel, campaignId?: string | null) {
	const qs = buildParams({ ...scopeParams(scope), level, campaignId });
	const { data } = await axios.get<TGetMetaAdsInsightsOutput>(`/api/integrations/meta/ads/insights?${qs}`);
	return data.data;
}

/** Totais da conta (ou de uma campanha, com `campaignId`) no período e na comparação. */
export function useMetaAdsAccountInsights({
	scope,
	campaignId,
	enabled = true,
}: {
	scope: TMetaAdsScope;
	campaignId?: string | null;
	enabled?: boolean;
}) {
	const queryKey = ["meta-ads-insights", ...scopeKey(scope), "account", campaignId ?? ""];
	return {
		...useQuery({
			queryKey,
			queryFn: async () => {
				const data = await fetchMetaAdsInsights(scope, "account", campaignId);
				if (!data.account) throw new Error("Métricas da conta não encontradas.");
				return data.account;
			},
			enabled: enabled && !!scope.integrationId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

/** Linhas por campanha, conjunto ou anúncio, cada uma com a comparação. */
export function useMetaAdsInsightRows({
	scope,
	level,
	campaignId,
	enabled = true,
}: {
	scope: TMetaAdsScope;
	level: Exclude<TInsightsLevel, "account">;
	campaignId?: string | null;
	enabled?: boolean;
}) {
	const queryKey = ["meta-ads-insights", ...scopeKey(scope), level, campaignId ?? ""];
	return {
		...useQuery({
			queryKey,
			queryFn: async () => (await fetchMetaAdsInsights(scope, level, campaignId)).rows ?? [],
			enabled: enabled && !!scope.integrationId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

/* -------------------------------- Séries -------------------------------- */

async function fetchMetaAdsSeries(scope: TMetaAdsScope, objectId?: string | null) {
	const qs = buildParams({ ...scopeParams(scope), objectId });
	const { data } = await axios.get<TGetMetaAdsSeriesOutput>(`/api/integrations/meta/ads/series?${qs}`);
	return data.data;
}

export function useMetaAdsSeries({ scope, objectId, enabled = true }: { scope: TMetaAdsScope; objectId?: string | null; enabled?: boolean }) {
	const queryKey = ["meta-ads-series", ...scopeKey(scope), objectId ?? ""];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchMetaAdsSeries(scope, objectId),
			enabled: enabled && !!scope.integrationId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

/* ------------------------------- Recortes ------------------------------- */

async function fetchMetaAdsBreakdown(scope: TMetaAdsScope, type: TMetaAdsBreakdownType, objectId?: string | null) {
	// Recortes não têm comparação: só o período.
	const qs = buildParams({ integrationId: scope.integrationId, since: scope.since, until: scope.until, type, objectId });
	const { data } = await axios.get<TGetMetaAdsBreakdownsOutput>(`/api/integrations/meta/ads/breakdowns?${qs}`);
	return data.data.breakdown;
}

export function useMetaAdsBreakdown({
	scope,
	type,
	objectId,
	enabled = true,
}: {
	scope: TMetaAdsScope;
	type: TMetaAdsBreakdownType;
	objectId?: string | null;
	enabled?: boolean;
}) {
	const queryKey = ["meta-ads-breakdown", scope.integrationId ?? "", scope.since, scope.until, type, objectId ?? ""];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchMetaAdsBreakdown(scope, type, objectId),
			enabled: enabled && !!scope.integrationId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

/* ------------------------------ Biblioteca ------------------------------ */

export type TMetaAdsLibrarySort = "spend" | "results" | "costPerResult" | "ctr" | "roas" | "recent" | "name";

export type TMetaAdsLibraryParams = {
	status: "all" | TMediaAdStatusGroup;
	campaignId: string | null;
	mediaType: TMediaAdMediaTypeEnum | null;
	search: string;
	sort: TMetaAdsLibrarySort;
	resultKey: TMetaResultKey;
	page: number;
	pageSize: number;
};

async function fetchMetaAdsLibrary(scope: TMetaAdsScope, params: TMetaAdsLibraryParams) {
	const qs = buildParams({
		integrationId: scope.integrationId,
		since: scope.since,
		until: scope.until,
		status: params.status === "all" ? null : params.status,
		campaignId: params.campaignId,
		mediaType: params.mediaType,
		search: params.search.trim(),
		sort: params.sort,
		resultKey: params.resultKey,
		page: params.page,
		pageSize: params.pageSize,
	});
	const { data } = await axios.get<TGetMetaAdsLibraryOutput>(`/api/integrations/meta/ads/library?${qs}`);
	return data.data;
}

export function useMetaAdsLibrary({ scope, params, enabled = true }: { scope: TMetaAdsScope; params: TMetaAdsLibraryParams; enabled?: boolean }) {
	const queryKey = ["meta-ads-library", scope.integrationId ?? "", scope.since, scope.until, params];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchMetaAdsLibrary(scope, params),
			enabled: enabled && !!scope.integrationId,
			staleTime: META_ADS_STALE_TIME,
			placeholderData: keepPreviousData,
		}),
		queryKey,
	};
}

/* -------------------------- Estrutura e detalhe ------------------------- */

async function fetchMetaAdsHierarchy(scope: TMetaAdsScope, campaignId: string) {
	const qs = buildParams({ integrationId: scope.integrationId, since: scope.since, until: scope.until, campaignId });
	const { data } = await axios.get<TGetMetaAdsHierarchyOutput>(`/api/integrations/meta/ads/hierarchy?${qs}`);
	return data.data.adsets;
}

export function useMetaAdsCampaignHierarchy({ scope, campaignId, enabled = true }: { scope: TMetaAdsScope; campaignId: string; enabled?: boolean }) {
	const queryKey = ["meta-ads-hierarchy", scope.integrationId ?? "", scope.since, scope.until, campaignId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchMetaAdsHierarchy(scope, campaignId),
			enabled: enabled && !!scope.integrationId && !!campaignId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

async function fetchMetaAdsAdById(scope: TMetaAdsScope, adId: string) {
	const qs = buildParams({ ...scopeParams(scope), id: adId });
	const { data } = await axios.get<TGetMetaAdsAdOutput>(`/api/integrations/meta/ads/ad?${qs}`);
	return data.data.byId;
}

export function useMetaAdsAdById({ scope, adId, enabled = true }: { scope: TMetaAdsScope; adId: string; enabled?: boolean }) {
	const queryKey = ["meta-ads-ad-by-id", ...scopeKey(scope), adId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchMetaAdsAdById(scope, adId),
			enabled: enabled && !!scope.integrationId && !!adId,
			staleTime: META_ADS_STALE_TIME,
		}),
		queryKey,
	};
}

import dayjs from "dayjs";

import { buildMetaAdsInsightFields } from "./fields";
import { fetchMetaAdsInsightsRaw } from "./insights-query";
import { buildRankings, emptyMetaAdsRichMetrics, normalizeMetaAdsInsight, normalizeMetaAdsRich } from "./mappers";
import type {
	TMetaAdsInsightLevel,
	TMetaAdsIntegrationConfigWithToken,
	TMetaAdsQualityRankings,
	TMetaAdsRichEntity,
	TMetaAdsRichMetrics,
	TMetaAdsSeriesPoint,
	TNormalizedMetaAdsMetrics,
} from "./types";

type TPeriodParams = {
	config: TMetaAdsIntegrationConfigWithToken;
	since: string;
	until: string;
};

/** Campos enxutos das séries diárias: o gráfico só usa as métricas base. */
const SERIES_FIELDS = [
	"date_start",
	"impressions",
	"reach",
	"frequency",
	"clicks",
	"inline_link_clicks",
	"spend",
	"cpc",
	"cpm",
	"ctr",
	"actions",
	"action_values",
	"purchase_roas",
] as const;

/** Filtro nativo da Graph API que restringe as linhas a uma campanha. */
function campaignFilter(campaignId: string | null | undefined) {
	return campaignId ? [{ field: "campaign.id", operator: "EQUAL", value: campaignId }] : undefined;
}

/** Uma entidade por linha, no nível pedido, com todas as famílias de métricas. */
export async function fetchMetaAdsRichEntities(
	params: TPeriodParams & { level: Exclude<TMetaAdsInsightLevel, "account">; campaignId?: string | null; includeVideo?: boolean },
): Promise<TMetaAdsRichEntity[]> {
	const rows = await fetchMetaAdsInsightsRaw({
		config: params.config,
		level: params.level,
		since: params.since,
		until: params.until,
		fields: buildMetaAdsInsightFields({ level: params.level, includeVideo: params.includeVideo, includeRankings: false }),
		filtering: campaignFilter(params.campaignId),
	});
	return rows.map((row) => ({
		level: params.level,
		campaignId: row.campaign_id,
		campaignName: row.campaign_name,
		adsetId: row.adset_id,
		adsetName: row.adset_name,
		adId: row.ad_id,
		adName: row.ad_name,
		metrics: normalizeMetaAdsRich(row),
	}));
}

/** Agregado de uma entidade (`objectId`) ou da conta inteira no período. */
export async function fetchMetaAdsRichTotals(params: TPeriodParams & { objectId?: string | null }): Promise<TMetaAdsRichMetrics> {
	const rows = await fetchMetaAdsInsightsRaw({
		config: params.config,
		level: params.objectId ? undefined : "account",
		objectId: params.objectId ?? undefined,
		since: params.since,
		until: params.until,
		fields: buildMetaAdsInsightFields({ level: "account", includeIdentity: false, includeRankings: false }),
	});
	const [row] = rows;
	return row ? normalizeMetaAdsRich(row) : emptyMetaAdsRichMetrics();
}

const EMPTY_METRICS: TNormalizedMetaAdsMetrics = normalizeMetaAdsInsight({});

/** Série diária da conta ou de uma entidade, com todos os dias do intervalo (sem entrega = zero). */
export async function fetchMetaAdsDailySeries(params: TPeriodParams & { objectId?: string | null }): Promise<TMetaAdsSeriesPoint[]> {
	const rows = await fetchMetaAdsInsightsRaw({
		config: params.config,
		level: params.objectId ? undefined : "account",
		objectId: params.objectId ?? undefined,
		since: params.since,
		until: params.until,
		fields: SERIES_FIELDS,
		timeIncrement: 1,
		limit: 1000,
	});
	const byDate = new Map<string, TNormalizedMetaAdsMetrics>();
	for (const row of rows) {
		if (row.date_start) byDate.set(row.date_start, normalizeMetaAdsInsight(row));
	}
	const points: TMetaAdsSeriesPoint[] = [];
	const end = dayjs(params.until);
	for (let cursor = dayjs(params.since); !cursor.isAfter(end, "day"); cursor = cursor.add(1, "day")) {
		const date = cursor.format("YYYY-MM-DD");
		points.push({ date, metrics: byDate.get(date) ?? EMPTY_METRICS });
	}
	return points;
}

/**
 * Rankings de relevância de um anúncio. Só existem no agregado (sem `time_increment`) e para
 * anúncios com entrega suficiente; falha vira `null`, sem derrubar o detalhe.
 */
export async function fetchMetaAdsAdRankings(params: TPeriodParams & { adId: string }): Promise<TMetaAdsQualityRankings | null> {
	try {
		const [row] = await fetchMetaAdsInsightsRaw({
			config: params.config,
			objectId: params.adId,
			since: params.since,
			until: params.until,
			fields: ["quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking"],
		});
		if (!row) return null;
		const rankings = buildRankings(row);
		return rankings.quality || rankings.engagementRate || rankings.conversionRate ? rankings : null;
	} catch {
		return null;
	}
}

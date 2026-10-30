import type { TMetaAdsBreakdownKey, TMetaAdsInsightLevel } from "./types";

/**
 * Catálogo de campos da Graph Insights API e construtores que montam o conjunto
 * correto de `fields` por nível/breakdown. Centralizar isso evita repetir listas
 * de campos em cada fetcher e — principalmente — garante que campos incompatíveis
 * com um breakdown (ex.: `reach`/`frequency` com breakdown por hora, ou os
 * rankings de qualidade fora do nível de anúncio) nunca sejam pedidos, o que
 * faria a Meta rejeitar a chamada inteira.
 */

/** Campos de identidade da entidade, por nível de agregação. */
export const META_ADS_IDENTITY_FIELDS: Record<TMetaAdsInsightLevel, readonly string[]> = {
	account: ["account_id", "account_name"],
	campaign: ["campaign_id", "campaign_name"],
	adset: ["adset_id", "adset_name", "campaign_id", "campaign_name"],
	ad: ["ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name"],
};

/** Métricas base de entrega. `reach`/`frequency`/`cpp` dependem de reach. */
const CORE_METRIC_FIELDS = ["impressions", "reach", "frequency", "clicks", "inline_link_clicks", "spend", "cpc", "cpm", "cpp", "ctr"] as const;

/** Campos que a Meta só entrega quando `reach` é suportado no recorte. */
const REACH_DEPENDENT_FIELDS = new Set<string>(["reach", "frequency", "cpp"]);

/** Ações de conversão + valores + custo por ação (o funil completo é derivado daqui). */
const CONVERSION_FIELDS = [
	"actions",
	"action_values",
	"purchase_roas",
	"website_purchase_roas",
	"conversions",
	"conversion_values",
	"cost_per_action_type",
	"cost_per_conversion",
] as const;

/** Cliques/engajamento estendidos além do conjunto base. */
const ENGAGEMENT_FIELDS = [
	"outbound_clicks",
	"unique_clicks",
	"unique_ctr",
	"unique_inline_link_click_ctr",
	"cost_per_unique_click",
	"inline_post_engagement",
] as const;

/** Funil de vídeo (hook/hold/retenção derivados destes). */
const VIDEO_FIELDS = [
	"video_play_actions",
	"video_thruplay_watched_actions",
	"video_30_sec_watched_actions",
	"video_p25_watched_actions",
	"video_p50_watched_actions",
	"video_p75_watched_actions",
	"video_p95_watched_actions",
	"video_p100_watched_actions",
	"video_avg_time_watched_actions",
] as const;

/** Rankings de leilão — apenas nível de anúncio, sem breakdowns e sem time_increment. */
const RANKING_FIELDS = ["quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking"] as const;

/** Breakdowns que fazem a Meta remover `reach`/`frequency` (e portanto `cpp`) da resposta. */
const REACH_INCOMPATIBLE_BREAKDOWNS = new Set<TMetaAdsBreakdownKey>(["hourly_stats_aggregated_by_advertiser_time_zone"]);

export type TBuildMetaAdsFieldsOptions = {
	level: TMetaAdsInsightLevel;
	breakdowns?: readonly TMetaAdsBreakdownKey[];
	timeIncrement?: number | "all_days";
	/** Inclui as métricas de vídeo. Default: true. */
	includeVideo?: boolean;
	/** Inclui os rankings de qualidade quando o contexto permite. Default: true. */
	includeRankings?: boolean;
	/** Inclui os campos de identidade da entidade. Default: true. */
	includeIdentity?: boolean;
};

function supportsReach(breakdowns?: readonly TMetaAdsBreakdownKey[]): boolean {
	if (!breakdowns || breakdowns.length === 0) return true;
	return !breakdowns.some((key) => REACH_INCOMPATIBLE_BREAKDOWNS.has(key));
}

/**
 * Rankings só são retornados no nível de anúncio, em consultas agregadas
 * (sem breakdowns e sem série temporal).
 */
function supportsRankings(options: TBuildMetaAdsFieldsOptions): boolean {
	return (
		options.includeRankings !== false &&
		options.level === "ad" &&
		(!options.breakdowns || options.breakdowns.length === 0) &&
		options.timeIncrement == null
	);
}

/** Monta o conjunto completo de `fields` (identidade + métricas ricas) respeitando as restrições do recorte. */
export function buildMetaAdsInsightFields(options: TBuildMetaAdsFieldsOptions): string[] {
	const includeReach = supportsReach(options.breakdowns);
	const fields: string[] = [];

	if (options.includeIdentity !== false) fields.push(...META_ADS_IDENTITY_FIELDS[options.level]);

	for (const field of CORE_METRIC_FIELDS) {
		if (!includeReach && REACH_DEPENDENT_FIELDS.has(field)) continue;
		fields.push(field);
	}

	fields.push(...CONVERSION_FIELDS);
	fields.push(...ENGAGEMENT_FIELDS);
	if (options.includeVideo !== false) fields.push(...VIDEO_FIELDS);
	if (supportsRankings(options)) fields.push(...RANKING_FIELDS);

	return [...new Set(fields)];
}

import type { TMetaAdsIntegrationConfig } from "@/schemas/integrations";

export const META_GRAPH_API_VERSION = "v25.0";
// ads_read: ler insights/biblioteca. ads_management + business_management: CAPI-write e Custom
// Audiences (Fases 2/3) — pedidos já na conexão inicial para não exigir reconsent.
export const META_ADS_SCOPES = ["public_profile", "ads_read", "ads_management", "business_management"] as const;

/** Teto de dias por consulta de insights. Acima disso a Meta fica lenta e estoura o limite de dados. */
export const META_ADS_MAX_RANGE_DAYS = 90;

export type TMetaAdsIntegrationConfigWithToken = TMetaAdsIntegrationConfig;

export type TMetaAdsActionStat = {
	action_type?: string;
	value?: string;
};

export type TMetaAdsPurchaseRoasStat = {
	action_type?: string;
	value?: string;
};

export type TMetaAdsInsightLevel = "account" | "campaign" | "adset" | "ad";

export type TMetaAdsBreakdownKey =
	| "age"
	| "gender"
	| "country"
	| "region"
	| "publisher_platform"
	| "platform_position"
	| "impression_device"
	| "hourly_stats_aggregated_by_advertiser_time_zone";

/** Linha crua da Insights API. Todos os campos são opcionais: a Meta omite o que não se aplica ao recorte. */
export type TMetaAdsInsightRow = Partial<Record<TMetaAdsBreakdownKey, string>> & {
	account_id?: string;
	account_name?: string;
	campaign_id?: string;
	campaign_name?: string;
	adset_id?: string;
	adset_name?: string;
	ad_id?: string;
	ad_name?: string;
	date_start?: string;
	date_stop?: string;
	impressions?: string;
	reach?: string;
	frequency?: string;
	clicks?: string;
	inline_link_clicks?: string;
	spend?: string;
	cpc?: string;
	cpm?: string;
	cpp?: string;
	ctr?: string;
	actions?: TMetaAdsActionStat[];
	action_values?: TMetaAdsActionStat[];
	purchase_roas?: TMetaAdsPurchaseRoasStat[];
	website_purchase_roas?: TMetaAdsPurchaseRoasStat[];
	cost_per_action_type?: TMetaAdsActionStat[];
	outbound_clicks?: TMetaAdsActionStat[];
	unique_clicks?: string;
	unique_ctr?: string;
	unique_inline_link_click_ctr?: string;
	inline_post_engagement?: string;
	video_play_actions?: TMetaAdsActionStat[];
	video_thruplay_watched_actions?: TMetaAdsActionStat[];
	video_30_sec_watched_actions?: TMetaAdsActionStat[];
	video_p25_watched_actions?: TMetaAdsActionStat[];
	video_p50_watched_actions?: TMetaAdsActionStat[];
	video_p75_watched_actions?: TMetaAdsActionStat[];
	video_p95_watched_actions?: TMetaAdsActionStat[];
	video_p100_watched_actions?: TMetaAdsActionStat[];
	video_avg_time_watched_actions?: TMetaAdsActionStat[];
	quality_ranking?: string;
	engagement_rate_ranking?: string;
	conversion_rate_ranking?: string;
};

export type TNormalizedMetaAdsMetrics = {
	impressions: number;
	reach: number;
	clicks: number;
	inlineLinkClicks: number;
	spend: number;
	cpc: number | null;
	cpm: number | null;
	ctr: number | null;
	frequency: number | null;
	leads: number;
	purchases: number;
	purchaseValue: number;
	purchaseRoas: number | null;
	/** Conversas iniciadas por mensagem (Click-to-WhatsApp, Messenger, Direct). */
	messagingConversationsStarted: number;
};

/* -------------------------------------------------------------------------- */
/*                               Métricas ricas                               */
/* -------------------------------------------------------------------------- */

/** Funil de conversão no site, derivado de `actions` / `cost_per_action_type`. */
export type TMetaAdsFunnelMetrics = {
	linkClicks: number;
	landingPageViews: number;
	viewContent: number;
	addToCart: number;
	initiateCheckout: number;
	addPaymentInfo: number;
	completeRegistration: number;
	leads: number;
	purchases: number;
	purchaseValue: number;
	costPerLandingPageView: number | null;
	costPerAddToCart: number | null;
	costPerInitiateCheckout: number | null;
	costPerLead: number | null;
	costPerPurchase: number | null;
	lpViewRate: number | null;
	addToCartRate: number | null;
	checkoutRate: number | null;
	purchaseRate: number | null;
};

/** Funil de vídeo e as taxas de qualidade do criativo. */
export type TMetaAdsVideoMetrics = {
	videoPlays: number;
	video3sViews: number;
	thruPlays: number;
	video30sViews: number;
	watched25: number;
	watched50: number;
	watched75: number;
	watched95: number;
	watched100: number;
	avgTimeWatched: number | null;
	/** Visualizações de 3s / impressões: quantos pararam de rolar. */
	hookRate: number | null;
	/** ThruPlays / impressões: quantos ficaram. */
	holdRate: number | null;
	/** Assistiram 100% / visualizações de 3s. */
	completionRate: number | null;
};

export type TMetaAdsQualityRanking = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE_10" | "BELOW_AVERAGE_20" | "BELOW_AVERAGE_35" | (string & {});

export type TMetaAdsQualityRankings = {
	quality: TMetaAdsQualityRanking | null;
	engagementRate: TMetaAdsQualityRanking | null;
	conversionRate: TMetaAdsQualityRanking | null;
};

export type TMetaAdsEngagementMetrics = {
	outboundClicks: number;
	uniqueClicks: number;
	uniqueCtr: number | null;
	uniqueLinkClickCtr: number | null;
	outboundCtr: number | null;
	postEngagement: number;
	pageEngagement: number;
	postReactions: number;
	comments: number;
	shares: number;
	linkCtr: number | null;
};

export type TMetaAdsRichMetrics = TNormalizedMetaAdsMetrics & {
	cpp: number | null;
	websitePurchaseRoas: number | null;
	funnel: TMetaAdsFunnelMetrics;
	video: TMetaAdsVideoMetrics;
	engagement: TMetaAdsEngagementMetrics;
	rankings: TMetaAdsQualityRankings;
};

/** Uma linha de insights em qualquer nível, já normalizada. Os ids presentes dependem do nível. */
export type TMetaAdsRichEntity = {
	level: TMetaAdsInsightLevel;
	campaignId?: string;
	campaignName?: string;
	adsetId?: string;
	adsetName?: string;
	adId?: string;
	adName?: string;
	metrics: TMetaAdsRichMetrics;
};

/* -------------------------------------------------------------------------- */
/*                                 Recortes                                   */
/* -------------------------------------------------------------------------- */

export type TMetaAdsBreakdownType = "demographics" | "geography" | "placements" | "dayparting";

export type TMetaAdsBreakdownSegment = { key: string; metrics: TMetaAdsRichMetrics };

export type TMetaAdsDemographicsBreakdown = {
	type: "demographics";
	byAge: TMetaAdsBreakdownSegment[];
	byGender: TMetaAdsBreakdownSegment[];
	/** Faixa etária × gênero, para a visão cruzada. */
	byAgeGender: { age: string; gender: string; metrics: TMetaAdsRichMetrics }[];
};

export type TMetaAdsGeographyBreakdown = {
	type: "geography";
	byRegion: TMetaAdsBreakdownSegment[];
	byCountry: TMetaAdsBreakdownSegment[];
};

export type TMetaAdsPlacementsBreakdown = {
	type: "placements";
	byPlatform: TMetaAdsBreakdownSegment[];
	byPosition: { platform: string; position: string; metrics: TMetaAdsRichMetrics }[];
	byDevice: TMetaAdsBreakdownSegment[];
};

export type TMetaAdsDayPartingBreakdown = {
	type: "dayparting";
	/** 24 faixas no fuso da conta, de "00" a "23". */
	byHour: TMetaAdsBreakdownSegment[];
};

export type TMetaAdsBreakdown =
	| TMetaAdsDemographicsBreakdown
	| TMetaAdsGeographyBreakdown
	| TMetaAdsPlacementsBreakdown
	| TMetaAdsDayPartingBreakdown;

/* -------------------------------------------------------------------------- */
/*                                  Séries                                    */
/* -------------------------------------------------------------------------- */

export type TMetaAdsSeriesPoint = { date: string; metrics: TNormalizedMetaAdsMetrics };

/* -------------------------------------------------------------------------- */
/*                                 Criativo                                   */
/* -------------------------------------------------------------------------- */

export type TMetaAdsLibraryCreative = {
	id?: string;
	name?: string;
	title?: string;
	body?: string;
	object_type?: string;
	thumbnail_url?: string;
	image_url?: string;
	video_id?: string;
	call_to_action_type?: string;
	object_url?: string;
	link_url?: string;
	instagram_permalink_url?: string;
	effective_object_story_id?: string;
	asset_feed_spec?: unknown;
	object_story_spec?: unknown;
	/** Parâmetros acrescentados à URL de destino (UTMs com macros `{{campaign.name}}`…). */
	url_tags?: string;
};

export type TMetaAdsLibraryRow = {
	id: string;
	name?: string;
	status?: string;
	effective_status?: string;
	configured_status?: string;
	created_time?: string;
	updated_time?: string;
	campaign?: { id?: string; name?: string };
	adset?: { id?: string; name?: string };
	creative?: TMetaAdsLibraryCreative;
};

/** Cartão de carrossel (ou variação de imagem de um criativo dinâmico). */
export type TMetaAdsCreativeCard = {
	imageUrl?: string;
	videoId?: string;
	title?: string;
	description?: string;
	link?: string;
	callToActionType?: string;
};

/** Fonte reproduzível de um vídeo. A URL expira, por isso nunca é guardada. */
export type TMetaAdsCreativeVideo = {
	source?: string;
	picture?: string;
	/** Duração em segundos. */
	length?: number;
};

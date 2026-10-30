import {
	LEAD_ACTION_PRIORITY,
	MESSAGING_CONVERSATION_ACTION_PRIORITY,
	PURCHASE_ACTION_PRIORITY,
	buildActionMap,
	getPurchaseRoas,
	pickAction,
	ratio,
	toNullableNumber,
	toNumber,
} from "./action-metrics";
import type {
	TMetaAdsActionStat,
	TMetaAdsEngagementMetrics,
	TMetaAdsFunnelMetrics,
	TMetaAdsInsightRow,
	TMetaAdsQualityRankings,
	TMetaAdsRichMetrics,
	TMetaAdsVideoMetrics,
	TNormalizedMetaAdsMetrics,
} from "./types";

// Etapas do funil: a variante mais abrangente vem primeiro, e só uma é contada.
const LANDING_PAGE_VIEW_KEYS = ["omni_landing_page_view", "landing_page_view"] as const;
const VIEW_CONTENT_KEYS = ["omni_view_content", "view_content", "offsite_conversion.fb_pixel_view_content"] as const;
const ADD_TO_CART_KEYS = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"] as const;
const INITIATE_CHECKOUT_KEYS = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"] as const;
const ADD_PAYMENT_INFO_KEYS = ["omni_add_payment_info", "add_payment_info", "offsite_conversion.fb_pixel_add_payment_info"] as const;
const COMPLETE_REGISTRATION_KEYS = [
	"omni_complete_registration",
	"complete_registration",
	"offsite_conversion.fb_pixel_complete_registration",
] as const;
const LINK_CLICK_KEYS = ["link_click"] as const;
const VIDEO_3S_KEYS = ["video_view"] as const;

/** Métricas base de uma linha. A contagem de compras, leads e conversas usa uma família de ação só. */
export function normalizeMetaAdsInsight(row: TMetaAdsInsightRow): TNormalizedMetaAdsMetrics {
	const actions = buildActionMap(row.actions);
	const values = buildActionMap(row.action_values);
	return {
		impressions: toNumber(row.impressions),
		reach: toNumber(row.reach),
		clicks: toNumber(row.clicks),
		inlineLinkClicks: toNumber(row.inline_link_clicks),
		spend: toNumber(row.spend),
		cpc: toNullableNumber(row.cpc),
		cpm: toNullableNumber(row.cpm),
		ctr: toNullableNumber(row.ctr),
		frequency: toNullableNumber(row.frequency),
		leads: pickAction(actions, LEAD_ACTION_PRIORITY),
		purchases: pickAction(actions, PURCHASE_ACTION_PRIORITY),
		purchaseValue: pickAction(values, PURCHASE_ACTION_PRIORITY),
		purchaseRoas: getPurchaseRoas(row.purchase_roas),
		messagingConversationsStarted: pickAction(actions, MESSAGING_CONVERSATION_ACTION_PRIORITY),
	};
}

function sumStat(stats: TMetaAdsActionStat[] | undefined): number {
	return (stats ?? []).reduce((total, stat) => total + toNumber(stat.value), 0);
}

/** Custo por resultado que a Meta informa; sem ele, gasto ÷ quantidade. */
function costPerResult(costMap: Map<string, number>, candidates: readonly string[], spend: number, count: number): number | null {
	const fromMeta = pickAction(costMap, candidates);
	if (fromMeta > 0) return fromMeta;
	return ratio(spend, count);
}

function buildFunnel(base: TNormalizedMetaAdsMetrics, actions: Map<string, number>, costs: Map<string, number>): TMetaAdsFunnelMetrics {
	const linkClicks = pickAction(actions, LINK_CLICK_KEYS);
	const landingPageViews = pickAction(actions, LANDING_PAGE_VIEW_KEYS);
	const addToCart = pickAction(actions, ADD_TO_CART_KEYS);
	const initiateCheckout = pickAction(actions, INITIATE_CHECKOUT_KEYS);
	return {
		linkClicks,
		landingPageViews,
		viewContent: pickAction(actions, VIEW_CONTENT_KEYS),
		addToCart,
		initiateCheckout,
		addPaymentInfo: pickAction(actions, ADD_PAYMENT_INFO_KEYS),
		completeRegistration: pickAction(actions, COMPLETE_REGISTRATION_KEYS),
		leads: base.leads,
		purchases: base.purchases,
		purchaseValue: base.purchaseValue,
		costPerLandingPageView: costPerResult(costs, LANDING_PAGE_VIEW_KEYS, base.spend, landingPageViews),
		costPerAddToCart: costPerResult(costs, ADD_TO_CART_KEYS, base.spend, addToCart),
		costPerInitiateCheckout: costPerResult(costs, INITIATE_CHECKOUT_KEYS, base.spend, initiateCheckout),
		costPerLead: costPerResult(costs, LEAD_ACTION_PRIORITY, base.spend, base.leads),
		costPerPurchase: costPerResult(costs, PURCHASE_ACTION_PRIORITY, base.spend, base.purchases),
		lpViewRate: ratio(landingPageViews, linkClicks),
		addToCartRate: ratio(addToCart, landingPageViews),
		checkoutRate: ratio(initiateCheckout, addToCart),
		purchaseRate: ratio(base.purchases, initiateCheckout),
	};
}

function buildVideo(row: TMetaAdsInsightRow, actions: Map<string, number>, impressions: number): TMetaAdsVideoMetrics {
	const video3sViews = pickAction(actions, VIDEO_3S_KEYS);
	const thruPlays = sumStat(row.video_thruplay_watched_actions);
	const watched100 = sumStat(row.video_p100_watched_actions);
	const avgTimeWatched = sumStat(row.video_avg_time_watched_actions);
	return {
		videoPlays: sumStat(row.video_play_actions),
		video3sViews,
		thruPlays,
		video30sViews: sumStat(row.video_30_sec_watched_actions),
		watched25: sumStat(row.video_p25_watched_actions),
		watched50: sumStat(row.video_p50_watched_actions),
		watched75: sumStat(row.video_p75_watched_actions),
		watched95: sumStat(row.video_p95_watched_actions),
		watched100,
		avgTimeWatched: avgTimeWatched > 0 ? avgTimeWatched : null,
		hookRate: ratio(video3sViews, impressions),
		holdRate: ratio(thruPlays, impressions),
		completionRate: ratio(watched100, video3sViews),
	};
}

function buildEngagement(row: TMetaAdsInsightRow, actions: Map<string, number>, impressions: number, linkClicks: number): TMetaAdsEngagementMetrics {
	const outboundClicks = sumStat(row.outbound_clicks);
	const inlinePostEngagement = toNumber(row.inline_post_engagement);
	return {
		outboundClicks,
		uniqueClicks: toNumber(row.unique_clicks),
		uniqueCtr: toNullableNumber(row.unique_ctr),
		uniqueLinkClickCtr: toNullableNumber(row.unique_inline_link_click_ctr),
		outboundCtr: ratio(outboundClicks, impressions),
		postEngagement: inlinePostEngagement > 0 ? inlinePostEngagement : pickAction(actions, ["post_engagement"]),
		pageEngagement: pickAction(actions, ["page_engagement"]),
		postReactions: pickAction(actions, ["post_reaction"]),
		comments: pickAction(actions, ["comment"]),
		shares: pickAction(actions, ["post"]),
		linkCtr: ratio(linkClicks, impressions),
	};
}

function normalizeRanking(value: string | undefined): string | null {
	if (!value || value.toUpperCase() === "UNKNOWN") return null;
	return value;
}

export function buildRankings(row: TMetaAdsInsightRow): TMetaAdsQualityRankings {
	return {
		quality: normalizeRanking(row.quality_ranking),
		engagementRate: normalizeRanking(row.engagement_rate_ranking),
		conversionRate: normalizeRanking(row.conversion_rate_ranking),
	};
}

/** Todas as famílias de métricas de uma linha. Pura: tudo deriva da própria linha. */
export function normalizeMetaAdsRich(row: TMetaAdsInsightRow): TMetaAdsRichMetrics {
	const base = normalizeMetaAdsInsight(row);
	const actions = buildActionMap(row.actions);
	const costs = buildActionMap(row.cost_per_action_type);
	const funnel = buildFunnel(base, actions, costs);
	return {
		...base,
		cpp: toNullableNumber(row.cpp),
		websitePurchaseRoas: getPurchaseRoas(row.website_purchase_roas),
		funnel,
		video: buildVideo(row, actions, base.impressions),
		engagement: buildEngagement(row, actions, base.impressions, funnel.linkClicks),
		rankings: buildRankings(row),
	};
}

export function emptyMetaAdsRichMetrics(): TMetaAdsRichMetrics {
	return normalizeMetaAdsRich({});
}

function sumBy<T>(list: readonly T[], selector: (item: T) => number): number {
	return list.reduce((total, item) => total + selector(item), 0);
}

/**
 * Combina várias métricas numa só (pivô de recortes). O que é aditivo é somado; taxas e razões são
 * recalculadas a partir das somas, nunca mediadas.
 *
 * `reach` somado entre segmentos superestima o alcance real (a mesma pessoa cai em mais de um
 * segmento) — é a aproximação padrão em recortes. Rankings de leilão não se agregam e voltam nulos.
 */
export function aggregateRichMetrics(list: readonly TMetaAdsRichMetrics[]): TMetaAdsRichMetrics {
	const [first] = list;
	if (!first) return emptyMetaAdsRichMetrics();
	if (list.length === 1) return first;

	const impressions = sumBy(list, (m) => m.impressions);
	const reach = sumBy(list, (m) => m.reach);
	const clicks = sumBy(list, (m) => m.clicks);
	const spend = sumBy(list, (m) => m.spend);
	const leads = sumBy(list, (m) => m.leads);
	const purchases = sumBy(list, (m) => m.purchases);
	const purchaseValue = sumBy(list, (m) => m.purchaseValue);
	const linkClicks = sumBy(list, (m) => m.funnel.linkClicks);
	const landingPageViews = sumBy(list, (m) => m.funnel.landingPageViews);
	const addToCart = sumBy(list, (m) => m.funnel.addToCart);
	const initiateCheckout = sumBy(list, (m) => m.funnel.initiateCheckout);
	const video3sViews = sumBy(list, (m) => m.video.video3sViews);
	const thruPlays = sumBy(list, (m) => m.video.thruPlays);
	const watched100 = sumBy(list, (m) => m.video.watched100);
	const outboundClicks = sumBy(list, (m) => m.engagement.outboundClicks);

	return {
		impressions,
		reach,
		clicks,
		inlineLinkClicks: sumBy(list, (m) => m.inlineLinkClicks),
		spend,
		cpc: ratio(spend, clicks),
		cpm: ratio(spend * 1000, impressions),
		ctr: ratio(clicks * 100, impressions),
		frequency: ratio(impressions, reach),
		leads,
		purchases,
		purchaseValue,
		purchaseRoas: ratio(purchaseValue, spend),
		messagingConversationsStarted: sumBy(list, (m) => m.messagingConversationsStarted),
		cpp: ratio(spend * 1000, reach),
		websitePurchaseRoas: null,
		funnel: {
			linkClicks,
			landingPageViews,
			viewContent: sumBy(list, (m) => m.funnel.viewContent),
			addToCart,
			initiateCheckout,
			addPaymentInfo: sumBy(list, (m) => m.funnel.addPaymentInfo),
			completeRegistration: sumBy(list, (m) => m.funnel.completeRegistration),
			leads,
			purchases,
			purchaseValue,
			costPerLandingPageView: ratio(spend, landingPageViews),
			costPerAddToCart: ratio(spend, addToCart),
			costPerInitiateCheckout: ratio(spend, initiateCheckout),
			costPerLead: ratio(spend, leads),
			costPerPurchase: ratio(spend, purchases),
			lpViewRate: ratio(landingPageViews, linkClicks),
			addToCartRate: ratio(addToCart, landingPageViews),
			checkoutRate: ratio(initiateCheckout, addToCart),
			purchaseRate: ratio(purchases, initiateCheckout),
		},
		video: {
			videoPlays: sumBy(list, (m) => m.video.videoPlays),
			video3sViews,
			thruPlays,
			video30sViews: sumBy(list, (m) => m.video.video30sViews),
			watched25: sumBy(list, (m) => m.video.watched25),
			watched50: sumBy(list, (m) => m.video.watched50),
			watched75: sumBy(list, (m) => m.video.watched75),
			watched95: sumBy(list, (m) => m.video.watched95),
			watched100,
			avgTimeWatched: null,
			hookRate: ratio(video3sViews, impressions),
			holdRate: ratio(thruPlays, impressions),
			completionRate: ratio(watched100, video3sViews),
		},
		engagement: {
			outboundClicks,
			uniqueClicks: sumBy(list, (m) => m.engagement.uniqueClicks),
			uniqueCtr: null,
			uniqueLinkClickCtr: null,
			outboundCtr: ratio(outboundClicks, impressions),
			postEngagement: sumBy(list, (m) => m.engagement.postEngagement),
			pageEngagement: sumBy(list, (m) => m.engagement.pageEngagement),
			postReactions: sumBy(list, (m) => m.engagement.postReactions),
			comments: sumBy(list, (m) => m.engagement.comments),
			shares: sumBy(list, (m) => m.engagement.shares),
			linkCtr: ratio(linkClicks, impressions),
		},
		rankings: { quality: null, engagementRate: null, conversionRate: null },
	};
}

import type { TMetaAdsQualityRanking, TNormalizedMetaAdsMetrics } from "@/lib/integrations/meta/ads/types";

/**
 * Formatadores e vocabulário da página de Mídia paga e do painel de detalhe. Nada aqui renderiza:
 * só funções puras, para que um número tenha um único jeito de ser escrito.
 * Valor ausente vira "—", nunca 0.
 */

const DASH = "—";

function isFiniteNumber(value: number | null | undefined): value is number {
	return value != null && Number.isFinite(value);
}

/** Valor monetário na moeda da conta (a conta de anúncios pode não ser em BRL). */
export function formatAdsCurrency(value: number | null | undefined, currency = "BRL"): string {
	if (!isFiniteNumber(value)) return DASH;
	try {
		return new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
	} catch {
		return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
	}
}

export function formatAdsNumber(value: number | null | undefined, digits = 0): string {
	if (!isFiniteNumber(value)) return DASH;
	return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

/** Escala curta para eixos e espaços apertados: "12,4 mil", "1,2 mi". */
export function formatAdsCompact(value: number | null | undefined): string {
	if (!isFiniteNumber(value)) return DASH;
	return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Percentual que a Meta já entrega em escala 0–100 (CTR). */
export function formatAdsPercent(value: number | null | undefined, digits = 2): string {
	if (!isFiniteNumber(value)) return DASH;
	return `${formatAdsNumber(value, digits)}%`;
}

/** Fração 0–1 → "12%" / "4,5%". */
export function formatAdsFraction(fraction: number | null | undefined): string {
	if (!isFiniteNumber(fraction)) return DASH;
	const percent = fraction * 100;
	return `${formatAdsNumber(percent, percent < 10 ? 1 : 0)}%`;
}

export function formatAdsRoas(value: number | null | undefined): string {
	if (!isFiniteNumber(value)) return DASH;
	return `${formatAdsNumber(value, 2)}x`;
}

/** "2026-09-03" → "03/09", para eixos. */
export function formatShortDate(isoDate: string): string {
	const [, month, day] = isoDate.split("-");
	return month && day ? `${day}/${month}` : isoDate;
}

/* -------------------------------------------------------------------------- */
/*                                  Deltas                                    */
/* -------------------------------------------------------------------------- */

export type TDelta = {
	/** Variação percentual com sinal. */
	percent: number;
	direction: "up" | "down" | "flat";
	/** `good` = favorável, considerando `lowerIsBetter`. */
	tone: "good" | "bad" | "neutral";
	/** Texto pronto: "+12%", "-8,5%", "0%". */
	text: string;
};

/**
 * Variação entre dois períodos. `null` quando não há base (algum lado ausente, ou ambos zero): a UI
 * não desenha delta. Anterior zero com atual positivo vira +100%. Menos de 0,5% é "estável".
 */
export function getDelta(current: number | null | undefined, previous: number | null | undefined, lowerIsBetter = false): TDelta | null {
	if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return null;
	if (previous === 0 && current === 0) return null;
	const percent = previous === 0 ? 100 : ((current - previous) / Math.abs(previous)) * 100;
	if (Math.abs(percent) < 0.5) return { percent: 0, direction: "flat", tone: "neutral", text: "0%" };
	const magnitude = Math.abs(percent);
	const good = lowerIsBetter ? percent < 0 : percent > 0;
	return {
		percent,
		direction: percent > 0 ? "up" : "down",
		tone: good ? "good" : "bad",
		text: `${percent > 0 ? "+" : "-"}${formatAdsNumber(magnitude, magnitude < 10 ? 1 : 0)}%`,
	};
}

/* -------------------------------------------------------------------------- */
/*                                Resultado                                   */
/* -------------------------------------------------------------------------- */

export type TMetaResultKey = "purchases" | "leads" | "messagingConversationsStarted";

export const META_RESULT_LABELS: Record<TMetaResultKey, { singular: string; plural: string; costLabel: string }> = {
	purchases: { singular: "compra", plural: "Compras", costLabel: "Custo por compra" },
	leads: { singular: "lead", plural: "Leads", costLabel: "Custo por lead" },
	messagingConversationsStarted: { singular: "conversa", plural: "Conversas", costLabel: "Custo por conversa" },
};

/**
 * Resultado principal de uma conta, campanha ou anúncio: compras quando existem, senão leads,
 * senão conversas iniciadas. Um varejo que anuncia para o WhatsApp não tem compra nem lead na Meta.
 */
export function pickMetaResultKey(metrics: Pick<TNormalizedMetaAdsMetrics, TMetaResultKey> | null | undefined): TMetaResultKey {
	if (!metrics) return "purchases";
	if (metrics.purchases > 0) return "purchases";
	if (metrics.leads > 0) return "leads";
	if (metrics.messagingConversationsStarted > 0) return "messagingConversationsStarted";
	return "purchases";
}

export function costPer(spend: number, count: number): number | null {
	return count > 0 ? spend / count : null;
}

/* -------------------------------------------------------------------------- */
/*                                  Status                                    */
/* -------------------------------------------------------------------------- */

export type TAdsStatusTone = "success" | "warning" | "destructive" | "info" | "muted";

/** `effective_status` da Meta (anúncio, conjunto ou campanha). */
export function getMetaStatusMeta(status: string | null | undefined): { label: string; tone: TAdsStatusTone } {
	if (!status) return { label: DASH, tone: "muted" };
	if (status === "ACTIVE") return { label: "Ativo", tone: "success" };
	if (status === "CAMPAIGN_PAUSED") return { label: "Campanha pausada", tone: "warning" };
	if (status === "ADSET_PAUSED") return { label: "Conjunto pausado", tone: "warning" };
	if (status.includes("PAUSED")) return { label: "Pausado", tone: "warning" };
	if (status === "DISAPPROVED") return { label: "Reprovado", tone: "destructive" };
	if (status === "WITH_ISSUES") return { label: "Com problemas", tone: "destructive" };
	if (status === "PENDING_BILLING_INFO") return { label: "Pagamento pendente", tone: "destructive" };
	if (status === "PENDING_REVIEW" || status === "IN_PROCESS" || status === "PREAPPROVED") return { label: "Em análise", tone: "info" };
	if (status === "ARCHIVED" || status === "DELETED") return { label: "Arquivado", tone: "muted" };
	return { label: status, tone: "muted" };
}

const META_OBJECTIVE_LABELS: Record<string, string> = {
	OUTCOME_LEADS: "Cadastros",
	OUTCOME_SALES: "Vendas",
	OUTCOME_TRAFFIC: "Tráfego",
	OUTCOME_ENGAGEMENT: "Engajamento",
	OUTCOME_AWARENESS: "Reconhecimento",
	OUTCOME_APP_PROMOTION: "Promoção de app",
	LEAD_GENERATION: "Cadastros",
	CONVERSIONS: "Conversões",
	MESSAGES: "Mensagens",
	LINK_CLICKS: "Tráfego",
	POST_ENGAGEMENT: "Engajamento",
	PAGE_LIKES: "Curtidas",
	REACH: "Alcance",
	BRAND_AWARENESS: "Reconhecimento",
	VIDEO_VIEWS: "Visualizações de vídeo",
	PRODUCT_CATALOG_SALES: "Catálogo",
	STORE_VISITS: "Visitas à loja",
};

export function getMetaObjectiveLabel(objective: string | null | undefined): string | null {
	if (!objective) return null;
	return META_OBJECTIVE_LABELS[objective] ?? objective;
}

const META_CTA_LABELS: Record<string, string> = {
	LEARN_MORE: "Saiba mais",
	SHOP_NOW: "Comprar agora",
	SIGN_UP: "Cadastre-se",
	CONTACT_US: "Fale conosco",
	WHATSAPP_MESSAGE: "Enviar mensagem no WhatsApp",
	SEND_MESSAGE: "Enviar mensagem",
	MESSAGE_PAGE: "Enviar mensagem",
	GET_QUOTE: "Solicitar orçamento",
	APPLY_NOW: "Inscreva-se",
	DOWNLOAD: "Baixar",
	WATCH_MORE: "Assistir mais",
	NO_BUTTON: "Sem botão",
	CALL_NOW: "Ligar agora",
	GET_OFFER: "Obter oferta",
	ORDER_NOW: "Pedir agora",
	SUBSCRIBE: "Inscrever-se",
	BUY_NOW: "Comprar",
};

export function getMetaCtaLabel(cta: string | null | undefined): string | null {
	if (!cta) return null;
	return (
		META_CTA_LABELS[cta] ??
		cta
			.replace(/_/g, " ")
			.toLowerCase()
			.replace(/^\w/, (c) => c.toUpperCase())
	);
}

/* -------------------------------------------------------------------------- */
/*                         Rankings de relevância                             */
/* -------------------------------------------------------------------------- */

export type TRankingLevel = "ABOVE" | "AVERAGE" | "BELOW";

/** Colapsa `BELOW_AVERAGE_10/20/35` em `BELOW`; a UI mostra três faixas. */
export function collapseRanking(raw: TMetaAdsQualityRanking | null | undefined): TRankingLevel | null {
	if (!raw || raw === "UNKNOWN") return null;
	if (raw === "ABOVE_AVERAGE") return "ABOVE";
	if (raw === "AVERAGE") return "AVERAGE";
	if (raw.startsWith("BELOW_AVERAGE")) return "BELOW";
	return null;
}

export function getRankingLabel(raw: string | null | undefined): string {
	if (!raw || raw === "UNKNOWN") return "Sem dados suficientes";
	if (raw === "ABOVE_AVERAGE") return "Acima da média";
	if (raw === "AVERAGE") return "Na média";
	const match = /^BELOW_AVERAGE_(\d+)$/.exec(raw);
	if (match) return `Abaixo da média (${match[1]}% inferiores)`;
	return "Abaixo da média";
}

/* -------------------------------------------------------------------------- */
/*                                 Recortes                                   */
/* -------------------------------------------------------------------------- */

const GENDER_LABELS: Record<string, string> = { female: "Mulheres", male: "Homens", unknown: "Não informado" };
const PLATFORM_LABELS: Record<string, string> = {
	facebook: "Facebook",
	instagram: "Instagram",
	messenger: "Messenger",
	audience_network: "Audience Network",
	threads: "Threads",
	whatsapp: "WhatsApp",
};
const POSITION_LABELS: Record<string, string> = {
	feed: "Feed",
	story: "Stories",
	instagram_stories: "Stories",
	facebook_stories: "Stories",
	reels: "Reels",
	instagram_reels: "Reels",
	facebook_reels: "Reels",
	facebook_reels_overlay: "Reels (sobreposição)",
	instagram_explore: "Explorar",
	instagram_explore_grid_home: "Explorar (grade)",
	instagram_profile_feed: "Feed do perfil",
	instagram_search: "Busca",
	marketplace: "Marketplace",
	video_feeds: "Vídeos",
	instream_video: "Vídeo in-stream",
	search: "Busca",
	right_hand_column: "Coluna direita",
	an_classic: "Nativo/banner",
	rewarded_video: "Vídeo com recompensa",
	messenger_inbox: "Caixa de entrada",
	messenger_stories: "Stories",
	threads_feed: "Feed",
	status: "Status",
	unknown: "Não informado",
};
const DEVICE_LABELS: Record<string, string> = {
	android_smartphone: "Android",
	iphone: "iPhone",
	android_tablet: "Tablet Android",
	ipad: "iPad",
	desktop: "Computador",
	ipod: "iPod",
	other: "Outros",
};

export function getGenderLabel(value: string): string {
	return GENDER_LABELS[value] ?? value;
}
export function getPlatformLabel(value: string): string {
	return PLATFORM_LABELS[value] ?? value;
}
export function getPositionLabel(value: string): string {
	return POSITION_LABELS[value] ?? value.replace(/_/g, " ");
}
export function getDeviceLabel(value: string): string {
	return DEVICE_LABELS[value] ?? value.replace(/_/g, " ");
}

/** Link para o Gerenciador de Anúncios, já filtrado na entidade. */
export function getMetaAdsManagerUrl(params: { adAccountNumericId: string; level: "campaign" | "adset" | "ad"; entityId: string }): string {
	const tab = params.level === "campaign" ? "campaigns" : params.level === "adset" ? "adsets" : "ads";
	const selected = params.level === "campaign" ? "selected_campaign_ids" : params.level === "adset" ? "selected_adset_ids" : "selected_ad_ids";
	return `https://adsmanager.facebook.com/adsmanager/manage/${tab}?act=${params.adAccountNumericId}&${selected}=${params.entityId}`;
}

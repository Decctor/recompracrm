import { metaGraphGet, metaGraphGetByFullUrl } from "./client";
import { type TMetaAdsCatalogAd, normalizeCatalogAd } from "./library";
import type { TMetaAdsIntegrationConfigWithToken, TMetaAdsLibraryRow } from "./types";

/**
 * Leitura do catálogo de anúncios de uma conta para a sincronização de `media_ads`: todos os
 * anúncios menos os apagados, com um corte opcional de `updated_time` para rodadas incrementais.
 */

/** Teto de segurança por conta. Contas reais ficam em centenas; acima disso não vale estourar a cota da Meta. */
export const META_ADS_CATALOG_MAX_ADS = 10_000;
const PAGE_SIZE = 100;
const MAX_NODE_PAGES = 50;

/**
 * Todos os status aceitos no filtro, menos `DELETED` (não combina com os demais e o anúncio apagado
 * já não tem criativo legível). Sem o filtro explícito a Meta omite os arquivados.
 */
const CATALOG_STATUSES = [
	"ACTIVE",
	"PAUSED",
	"ARCHIVED",
	"CAMPAIGN_PAUSED",
	"ADSET_PAUSED",
	"IN_PROCESS",
	"WITH_ISSUES",
	"PENDING_REVIEW",
	"DISAPPROVED",
	"PREAPPROVED",
	"PENDING_BILLING_INFO",
];

/** Campanhas e conjuntos aceitam um vocabulário menor; valor fora dele faz a Meta recusar a chamada inteira. */
const NODE_STATUSES = {
	campaigns: ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"],
	adsets: ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED"],
};

/**
 * `thumbnail_width/height`: o `thumbnail_url` padrão é 64×64, pequeno demais para a capa.
 * Imagens estáticas usam `image_url`, que já vem no tamanho original.
 */
const CREATIVE_FIELDS =
	"creative.thumbnail_width(640).thumbnail_height(640){id,name,title,body,object_type,thumbnail_url,image_url,video_id,call_to_action_type,object_url,link_url,instagram_permalink_url,effective_object_story_id,asset_feed_spec,object_story_spec,url_tags}";

const CATALOG_FIELDS = [
	"id",
	"name",
	"status",
	"effective_status",
	"configured_status",
	"created_time",
	"updated_time",
	"campaign{id,name}",
	"adset{id,name}",
	CREATIVE_FIELDS,
];

type TPage<T> = { data?: T[]; paging?: { next?: string } };

export async function fetchMetaAdsCatalog(params: {
	config: TMetaAdsIntegrationConfigWithToken;
	/** Só anúncios alterados depois deste instante (incremental). Omitido = varredura completa. */
	updatedSince?: Date;
}): Promise<{ ads: TMetaAdsCatalogAd[]; truncated: boolean }> {
	const filtering: Record<string, unknown>[] = [{ field: "effective_status", operator: "IN", value: CATALOG_STATUSES }];
	if (params.updatedSince) {
		filtering.push({ field: "updated_time", operator: "GREATER_THAN", value: Math.floor(params.updatedSince.getTime() / 1000) });
	}

	const rows: TMetaAdsLibraryRow[] = [];
	const first = await metaGraphGet<TPage<TMetaAdsLibraryRow>>(
		`/${params.config.adAccountId}/ads`,
		{ fields: CATALOG_FIELDS.join(","), limit: String(PAGE_SIZE), filtering: JSON.stringify(filtering) },
		params.config.accessToken,
	);
	rows.push(...(first.data ?? []));
	let nextUrl = first.paging?.next;
	while (nextUrl && rows.length < META_ADS_CATALOG_MAX_ADS) {
		const page = await metaGraphGetByFullUrl<TPage<TMetaAdsLibraryRow>>(nextUrl);
		rows.push(...(page.data ?? []));
		nextUrl = page.paging?.next;
	}

	return {
		ads: rows.slice(0, META_ADS_CATALOG_MAX_ADS).map(normalizeCatalogAd),
		truncated: !!nextUrl || rows.length > META_ADS_CATALOG_MAX_ADS,
	};
}

export type TMetaAdsCatalogNode = { id: string; name?: string; objective?: string; effective_status?: string };

/**
 * Nome, status e objetivo atuais de campanhas e conjuntos. Renomear ou pausar uma campanha não muda o
 * `updated_time` dos anúncios dela, então toda rodada relê esta lista leve.
 */
export async function fetchMetaAdsCatalogNodes(params: {
	config: TMetaAdsIntegrationConfigWithToken;
}): Promise<{ campaigns: TMetaAdsCatalogNode[]; adsets: TMetaAdsCatalogNode[] }> {
	const [campaigns, adsets] = await Promise.all([
		fetchAllNodes(params.config, "campaigns", "id,name,objective,effective_status"),
		fetchAllNodes(params.config, "adsets", "id,name,effective_status"),
	]);
	return { campaigns, adsets };
}

async function fetchAllNodes(config: TMetaAdsIntegrationConfigWithToken, edge: "campaigns" | "adsets", fields: string) {
	const first = await metaGraphGet<TPage<TMetaAdsCatalogNode>>(
		`/${config.adAccountId}/${edge}`,
		{ fields, limit: "500", filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: NODE_STATUSES[edge] }]) },
		config.accessToken,
	);
	const rows = [...(first.data ?? [])];
	let nextUrl = first.paging?.next;
	for (let pages = 1; nextUrl && pages < MAX_NODE_PAGES; pages++) {
		const page = await metaGraphGetByFullUrl<TPage<TMetaAdsCatalogNode>>(nextUrl);
		rows.push(...(page.data ?? []));
		nextUrl = page.paging?.next;
	}
	return rows;
}

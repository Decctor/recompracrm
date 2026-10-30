import { db } from "@/services/drizzle";
import { type TMediaAdEntity, mediaAds } from "@/services/drizzle/schema";
import { type SQL, and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

/** Grupos de status oferecidos no filtro da biblioteca. */
export const MEDIA_AD_STATUS_GROUPS = {
	active: ["ACTIVE"],
	paused: ["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"],
	review: ["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"],
	issues: ["DISAPPROVED", "WITH_ISSUES", "PENDING_BILLING_INFO"],
	archived: ["ARCHIVED"],
} as const;
export type TMediaAdStatusGroup = keyof typeof MEDIA_AD_STATUS_GROUPS;

const AD_VIEW_COLUMNS = {
	id: mediaAds.id,
	integracaoId: mediaAds.integracaoId,
	contaExternaId: mediaAds.contaExternaId,
	campanhaId: mediaAds.campanhaId,
	campanhaNome: mediaAds.campanhaNome,
	campanhaObjetivo: mediaAds.campanhaObjetivo,
	campanhaStatus: mediaAds.campanhaStatus,
	conjuntoId: mediaAds.conjuntoId,
	conjuntoNome: mediaAds.conjuntoNome,
	conjuntoStatus: mediaAds.conjuntoStatus,
	anuncioId: mediaAds.anuncioId,
	anuncioNome: mediaAds.anuncioNome,
	status: mediaAds.status,
	statusConfigurado: mediaAds.statusConfigurado,
	titulo: mediaAds.titulo,
	corpo: mediaAds.corpo,
	tipoMidia: mediaAds.tipoMidia,
	cartoes: mediaAds.cartoes,
	videoId: mediaAds.videoId,
	cta: mediaAds.cta,
	urlDestino: mediaAds.urlDestino,
	permalink: mediaAds.permalink,
	capaUrl: mediaAds.capaUrl,
	capaOrigemUrl: mediaAds.capaOrigemUrl,
	criadoNaPlataformaEm: mediaAds.criadoNaPlataformaEm,
	sincronizadoEm: mediaAds.sincronizadoEm,
	removidoEm: mediaAds.removidoEm,
} as const;

type TMediaAdViewRow = Pick<TMediaAdEntity, keyof typeof AD_VIEW_COLUMNS>;

/** O anúncio como as telas o leem. A capa cai para a URL da Meta enquanto a cópia não existe. */
export function toMediaAdView(row: TMediaAdViewRow) {
	const { capaOrigemUrl, ...rest } = row;
	return { ...rest, capaUrl: row.capaUrl ?? capaOrigemUrl };
}
export type TMediaAdView = ReturnType<typeof toMediaAdView>;

export type TCatalogAdsFilters = {
	integrationId: string;
	statusGroup?: TMediaAdStatusGroup | null;
	campaignId?: string | null;
	mediaType?: TMediaAdEntity["tipoMidia"] | null;
	search?: string | null;
};

function buildCatalogWhere(filters: TCatalogAdsFilters) {
	const conditions: SQL[] = [eq(mediaAds.integracaoId, filters.integrationId), isNull(mediaAds.removidoEm)];
	if (filters.statusGroup) conditions.push(inArray(mediaAds.status, [...MEDIA_AD_STATUS_GROUPS[filters.statusGroup]]));
	if (filters.campaignId) conditions.push(eq(mediaAds.campanhaId, filters.campaignId));
	if (filters.mediaType) conditions.push(eq(mediaAds.tipoMidia, filters.mediaType));
	const search = filters.search?.trim();
	if (search) {
		const pattern = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
		const searchCondition = or(
			ilike(mediaAds.anuncioNome, pattern),
			ilike(mediaAds.campanhaNome, pattern),
			ilike(mediaAds.conjuntoNome, pattern),
			ilike(mediaAds.titulo, pattern),
		);
		if (searchCondition) conditions.push(searchCondition);
	}
	return and(...conditions);
}

/** Todos os anúncios que passam nos filtros, dos mais recentes aos mais antigos. A ordenação por métrica vem depois. */
export async function listCatalogAds(filters: TCatalogAdsFilters) {
	const rows = await db
		.select(AD_VIEW_COLUMNS)
		.from(mediaAds)
		.where(buildCatalogWhere(filters))
		.orderBy(desc(mediaAds.criadoNaPlataformaEm), asc(mediaAds.anuncioNome));
	return rows.map(toMediaAdView);
}

export async function getCatalogAd({ integrationId, adId }: { integrationId: string; adId: string }) {
	const [row] = await db
		.select(AD_VIEW_COLUMNS)
		.from(mediaAds)
		.where(and(eq(mediaAds.integracaoId, integrationId), eq(mediaAds.anuncioId, adId)))
		.limit(1);
	return row ? toMediaAdView(row) : null;
}

/** Campanhas do catálogo (para o filtro da biblioteca), incluindo as sem entrega no período. */
export async function listCatalogCampaigns(integrationId: string) {
	const rows = await db
		.selectDistinctOn([mediaAds.campanhaId], {
			campanhaId: mediaAds.campanhaId,
			campanhaNome: mediaAds.campanhaNome,
			campanhaStatus: mediaAds.campanhaStatus,
		})
		.from(mediaAds)
		.where(and(eq(mediaAds.integracaoId, integrationId), isNull(mediaAds.removidoEm)));
	return rows
		.filter((row): row is typeof row & { campanhaId: string } => !!row.campanhaId)
		.sort((a, b) => (a.campanhaNome ?? "").localeCompare(b.campanhaNome ?? "", "pt-BR"));
}

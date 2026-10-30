import type { TMediaAdCard, TMediaAdMediaTypeEnum } from "@/schemas/media-ads";
import { metaGraphGet } from "./client";
import type {
	TMetaAdsCreativeCard,
	TMetaAdsCreativeVideo,
	TMetaAdsIntegrationConfigWithToken,
	TMetaAdsLibraryCreative,
	TMetaAdsLibraryRow,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readAssetText(assetFeedSpec: unknown, key: string) {
	if (!isRecord(assetFeedSpec)) return undefined;
	const value = assetFeedSpec[key];
	if (!Array.isArray(value)) return undefined;
	const first = value.find(isRecord);
	if (!first) return undefined;
	return asString(first.text) ?? asString(first.name);
}

function readAssetImage(assetFeedSpec: unknown) {
	if (!isRecord(assetFeedSpec) || !Array.isArray(assetFeedSpec.images)) return undefined;
	const first = assetFeedSpec.images.find(isRecord);
	if (!first) return undefined;
	return asString(first.url) ?? asString(first.image_url);
}

/** Cartões de `object_story_spec.link_data.child_attachments` (carrossel clássico). */
function readChildAttachments(objectStorySpec: unknown): TMetaAdsCreativeCard[] {
	if (!isRecord(objectStorySpec)) return [];
	const linkData = objectStorySpec.link_data;
	if (!isRecord(linkData) || !Array.isArray(linkData.child_attachments)) return [];
	return linkData.child_attachments.filter(isRecord).map((child) => ({
		imageUrl: asString(child.picture) ?? asString(child.image_url),
		videoId: asString(child.video_id),
		title: asString(child.name),
		description: asString(child.description),
		link: asString(child.link),
		callToActionType: isRecord(child.call_to_action) ? asString(child.call_to_action.type) : undefined,
	}));
}

/** Variações de imagem de um criativo dinâmico (`asset_feed_spec.images`). */
function readAssetFeedCards(assetFeedSpec: unknown): TMetaAdsCreativeCard[] {
	if (!isRecord(assetFeedSpec) || !Array.isArray(assetFeedSpec.images)) return [];
	return assetFeedSpec.images
		.filter(isRecord)
		.map((image) => ({ imageUrl: asString(image.url) ?? asString(image.image_url) }))
		.filter((card) => !!card.imageUrl);
}

function readStoryVideoId(objectStorySpec: unknown): string | undefined {
	if (!isRecord(objectStorySpec) || !isRecord(objectStorySpec.video_data)) return undefined;
	return asString(objectStorySpec.video_data.video_id);
}

/**
 * Formato do criativo. Carrossel = 2+ `child_attachments` (ou 2+ imagens em `asset_feed_spec`);
 * vídeo = `video_id` do criativo ou `video_data` do story spec.
 */
export function detectMetaAdsCreativeMedia(creative: TMetaAdsLibraryCreative | undefined): {
	tipoMidia: TMediaAdMediaTypeEnum;
	cards: TMetaAdsCreativeCard[];
	videoId: string | undefined;
} {
	if (!creative) return { tipoMidia: "DESCONHECIDO", cards: [], videoId: undefined };
	const childCards = readChildAttachments(creative.object_story_spec);
	const cards = childCards.length > 0 ? childCards : readAssetFeedCards(creative.asset_feed_spec);
	const videoId = creative.video_id ?? readStoryVideoId(creative.object_story_spec);

	let tipoMidia: TMediaAdMediaTypeEnum = "DESCONHECIDO";
	if (cards.length >= 2) tipoMidia = "CARROSSEL";
	else if (videoId || creative.object_type === "VIDEO") tipoMidia = "VIDEO";
	else if (creative.image_url || creative.thumbnail_url || cards.length === 1 || creative.object_type === "SHARE" || creative.object_type === "PHOTO")
		tipoMidia = "IMAGEM";

	return { tipoMidia, cards: cards.length >= 2 ? cards : [], videoId };
}

/** Um anúncio da Graph API já no formato do catálogo (`media_ads`), sem os campos de controle. */
export type TMetaAdsCatalogAd = {
	anuncioId: string;
	anuncioNome: string;
	status: string;
	statusConfigurado: string | null;
	campanhaId: string | null;
	campanhaNome: string | null;
	conjuntoId: string | null;
	conjuntoNome: string | null;
	criativoId: string | null;
	titulo: string | null;
	corpo: string | null;
	tipoMidia: TMediaAdMediaTypeEnum;
	cartoes: TMediaAdCard[];
	videoId: string | null;
	cta: string | null;
	urlDestino: string | null;
	permalink: string | null;
	urlTags: string | null;
	/** Melhor imagem para capa: original, primeiro cartão do carrossel ou miniatura do vídeo. */
	capaOrigemUrl: string | null;
	criadoNaPlataformaEm: Date | null;
	atualizadoNaPlataformaEm: Date | null;
};

export function normalizeCatalogAd(row: TMetaAdsLibraryRow): TMetaAdsCatalogAd {
	const creative = row.creative;
	const assetFeedSpec = creative?.asset_feed_spec;
	const media = detectMetaAdsCreativeMedia(creative);
	const imageUrl = creative?.image_url ?? readAssetImage(assetFeedSpec);
	const cards: TMediaAdCard[] = media.cards.map((card) => ({
		imagemUrl: card.imageUrl ?? null,
		videoId: card.videoId ?? null,
		titulo: card.title ?? null,
		descricao: card.description ?? null,
		link: card.link ?? null,
		cta: card.callToActionType ?? null,
	}));
	return {
		anuncioId: row.id,
		anuncioNome: row.name ?? creative?.name ?? "Anúncio",
		status: row.effective_status ?? row.status ?? "UNKNOWN",
		statusConfigurado: row.configured_status ?? row.status ?? null,
		campanhaId: row.campaign?.id ?? null,
		campanhaNome: row.campaign?.name ?? null,
		conjuntoId: row.adset?.id ?? null,
		conjuntoNome: row.adset?.name ?? null,
		criativoId: creative?.id ?? null,
		titulo: creative?.title ?? readAssetText(assetFeedSpec, "titles") ?? null,
		corpo: creative?.body ?? readAssetText(assetFeedSpec, "bodies") ?? null,
		tipoMidia: media.tipoMidia,
		cartoes: cards,
		videoId: media.videoId ?? null,
		cta: creative?.call_to_action_type ?? null,
		urlDestino: creative?.object_url ?? creative?.link_url ?? null,
		permalink: creative?.instagram_permalink_url ?? null,
		urlTags: creative?.url_tags ?? null,
		capaOrigemUrl: imageUrl ?? media.cards[0]?.imageUrl ?? creative?.thumbnail_url ?? null,
		criadoNaPlataformaEm: row.created_time ? new Date(row.created_time) : null,
		atualizadoNaPlataformaEm: row.updated_time ? new Date(row.updated_time) : null,
	};
}

/**
 * Fonte reproduzível de um vídeo. `source` só vem com permissão sobre o vídeo; sem ela a UI fica com
 * a capa. A URL expira em horas, por isso é buscada ao abrir o anúncio e nunca guardada.
 */
export async function fetchMetaAdsVideoSource(params: {
	config: TMetaAdsIntegrationConfigWithToken;
	videoId: string;
}): Promise<TMetaAdsCreativeVideo | null> {
	try {
		const response = await metaGraphGet<{ source?: string; picture?: string; length?: number }>(
			`/${params.videoId}`,
			{ fields: "source,picture,length" },
			params.config.accessToken,
		);
		return {
			source: asString(response.source),
			picture: asString(response.picture),
			length: typeof response.length === "number" ? response.length : undefined,
		};
	} catch {
		return null;
	}
}

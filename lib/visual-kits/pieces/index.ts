import type { TVisualKitFormatEnum } from "@/schemas/enums";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";
import { priceStickerRenderer } from "./price-sticker";
import { carouselRenderer } from "./carousel";
import { flyerRenderer } from "./flyer";
import { shelfLabelRenderer } from "./shelf-label";
import { whatsappListRenderer } from "./whatsapp-list";
import { feedPostRenderer } from "./feed-post";
import { productBadgeRenderer } from "./product-badge";
import type { TVisualKitPageSize, TVisualKitPieceRenderer } from "./shared";
import { storyRenderer } from "./story";
import { wobblerRenderer } from "./wobbler";

export const VISUAL_KIT_PIECE_RENDERERS: Record<TVisualKitFormatEnum, TVisualKitPieceRenderer> = {
	ETIQUETA_GONDOLA: shelfLabelRenderer,
	ADESIVO_PRECO: priceStickerRenderer,
	WOBBLER: wobblerRenderer,
	ENCARTE: flyerRenderer,
	SELO_PRODUTO: productBadgeRenderer,
	POST_FEED: feedPostRenderer,
	STORY: storyRenderer,
	CARROSSEL: carouselRenderer,
	LISTA_WHATSAPP: whatsappListRenderer,
};

export function paginateVisualKitPiece(formato: TVisualKitFormatEnum, props: TVisualKitPieceProps): TVisualKitPage[] {
	return VISUAL_KIT_PIECE_RENDERERS[formato].paginate(props);
}

export function getVisualKitPageSize(formato: TVisualKitFormatEnum, props: TVisualKitPieceProps, page: TVisualKitPage): TVisualKitPageSize {
	return VISUAL_KIT_PIECE_RENDERERS[formato].pageSize(props, page);
}

export { priceStickerRenderer, expandStickerItems } from "./price-sticker";
export { carouselRenderer } from "./carousel";
export { Ean13Barcode, EanBarcode, eanBars, normalizeEanCode, type TEanBars } from "./ean";
export { flyerRenderer } from "./flyer";
export { shelfLabelRenderer } from "./shelf-label";
export { whatsappListRenderer } from "./whatsapp-list";
export { feedPostRenderer } from "./feed-post";
export { productBadgeRenderer } from "./product-badge";
export {
	formatMoney,
	formatValidity,
	resolveItemDisplay,
	splitMoney,
	type TItemDisplay,
	type TVisualKitPageArgs,
	type TVisualKitPageSize,
	type TVisualKitPieceRenderer,
} from "./shared";
export { storyRenderer } from "./story";
export { wobblerRenderer } from "./wobbler";

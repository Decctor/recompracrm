import type { TVisualKitFormatEnum } from "@/schemas/enums";
import type { TVisualKitPage, TVisualKitPieceProps } from "../types";
import { adesivoPrecoRenderer } from "./adesivo-preco";
import { carrosselRenderer } from "./carrossel";
import { encarteRenderer } from "./encarte";
import { etiquetaGondolaRenderer } from "./etiqueta-gondola";
import { listaWhatsappRenderer } from "./lista-whatsapp";
import { postFeedRenderer } from "./post-feed";
import { seloProdutoRenderer } from "./selo-produto";
import type { TVisualKitPageSize, TVisualKitPieceRenderer } from "./shared";
import { storyRenderer } from "./story";
import { wobblerRenderer } from "./wobbler";

export const VISUAL_KIT_PIECE_RENDERERS: Record<TVisualKitFormatEnum, TVisualKitPieceRenderer> = {
	ETIQUETA_GONDOLA: etiquetaGondolaRenderer,
	ADESIVO_PRECO: adesivoPrecoRenderer,
	WOBBLER: wobblerRenderer,
	ENCARTE: encarteRenderer,
	SELO_PRODUTO: seloProdutoRenderer,
	POST_FEED: postFeedRenderer,
	STORY: storyRenderer,
	CARROSSEL: carrosselRenderer,
	LISTA_WHATSAPP: listaWhatsappRenderer,
};

export function paginateVisualKitPiece(formato: TVisualKitFormatEnum, props: TVisualKitPieceProps): TVisualKitPage[] {
	return VISUAL_KIT_PIECE_RENDERERS[formato].paginate(props);
}

export function getVisualKitPageSize(formato: TVisualKitFormatEnum, props: TVisualKitPieceProps, page: TVisualKitPage): TVisualKitPageSize {
	return VISUAL_KIT_PIECE_RENDERERS[formato].pageSize(props, page);
}

export { adesivoPrecoRenderer, expandStickerItems } from "./adesivo-preco";
export { carrosselRenderer } from "./carrossel";
export { Ean13Barcode, EanBarcode, eanBars, normalizeEanCode, type TEanBars } from "./ean";
export { encarteRenderer } from "./encarte";
export { etiquetaGondolaRenderer } from "./etiqueta-gondola";
export { listaWhatsappRenderer } from "./lista-whatsapp";
export { postFeedRenderer } from "./post-feed";
export { seloProdutoRenderer } from "./selo-produto";
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

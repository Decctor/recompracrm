import type { TVisualKitFormatEnum, TVisualKitOutputEnum } from "@/schemas/enums";

// Nomes de arquivo determinísticos e só ASCII: os mesmos produtos geram sempre os mesmos nomes, e
// nada quebra em sistemas de arquivos/zip que não lidam bem com acentos.

export const VISUAL_KIT_PIECE_SLUGS: Record<TVisualKitFormatEnum, string> = {
	ETIQUETA_GONDOLA: "etiquetas-gondola",
	ADESIVO_PRECO: "adesivos-preco",
	WOBBLER: "wobblers",
	ENCARTE: "encarte",
	SELO_PRODUTO: "selos-produto",
	POST_FEED: "posts-feed",
	STORY: "stories",
	CARROSSEL: "carrossel",
	LISTA_WHATSAPP: "lista-whatsapp",
};

export type TVisualKitFileExtension = "pdf" | "png" | "jpg";

const MAX_SLUG_LENGTH = 60;

/** "Café & Pão 500g" → "cafe-pao-500g". Vazio quando não sobra nenhum caractere ASCII útil. */
export function slugifyFileName(text: string, maxLength = MAX_SLUG_LENGTH): string {
	const slug = text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.slice(0, maxLength).replace(/-+$/, "");
}

export function visualKitOutputExtension(saida: TVisualKitOutputEnum): TVisualKitFileExtension {
	switch (saida) {
		case "PDF":
		case "PDF_ETIQUETADORA":
			return "pdf";
		case "PNG":
			return "png";
		case "JPG":
			return "jpg";
	}
}

/** Pasta da peça dentro do zip do kit. */
export function visualKitPieceFolderName(formato: TVisualKitFormatEnum): string {
	return VISUAL_KIT_PIECE_SLUGS[formato];
}

/** Atalho de `visualKitPieceFolderName` (nome usado pelas telas do kit). */
export const visualKitPieceFolder = visualKitPieceFolderName;

/** Ordem 1-based com zeros à esquerda: 2 dígitos no mínimo, mais quando o total passa de 99. */
export function padFileOrder(ordem: number, total: number): string {
	const digits = Math.max(2, String(Math.max(ordem, total)).length);
	return String(ordem).padStart(digits, "0");
}

/** Arquivo único da peça: `etiquetas-gondola.pdf`, `lista-whatsapp.png`. */
export function visualKitPieceFileName(formato: TVisualKitFormatEnum, ext: TVisualKitFileExtension): string {
	return `${VISUAL_KIT_PIECE_SLUGS[formato]}.${ext}`;
}

/** Imagem por produto: `03-shampoo-anticaspa-200ml.png`. */
export function visualKitProductFileName(args: { order: number; total: number; productName: string; ext: TVisualKitFileExtension }): string {
	const slug = slugifyFileName(args.productName) || "produto";
	return `${padFileOrder(args.order, args.total)}-${slug}.${args.ext}`;
}

/** Página do carrossel: `01.png`, `02.png`… */
export function visualKitCarouselFileName(args: { order: number; total: number; ext: TVisualKitFileExtension }): string {
	return `${padFileOrder(args.order, args.total)}.${args.ext}`;
}

/** Página de peça em várias imagens (encarte em PNG): `encarte-01.png`; uma página só → `encarte.png`. */
export function visualKitPagedFileName(args: { formato: TVisualKitFormatEnum; order: number; total: number; ext: TVisualKitFileExtension }): string {
	if (args.total <= 1) return visualKitPieceFileName(args.formato, args.ext);
	return `${VISUAL_KIT_PIECE_SLUGS[args.formato]}-${padFileOrder(args.order, args.total)}.${args.ext}`;
}

/** Zip do kit inteiro: `kit-ofertas-da-semana.zip`. */
export function kitZipName(kitName: string): string {
	const slug = slugifyFileName(kitName);
	return slug ? `kit-${slug}.zip` : "kit.zip";
}

import { mmToPx } from "../formats";

// Geometria da folha de etiquetas de gôndola (A4, grade 2 × 7 de 100 × 40 mm).
// Fonte da verdade: `lib/visual-kits/pieces/etiqueta-gondola.tsx` (PER_SHEET, LABEL_WIDTH,
// LABEL_HEIGHT, SHEET_TOP, SHEET_LEFT e o grid de 2 colunas preenchido linha a linha). Se o layout
// da folha mudar lá, mude aqui também — o PDF para etiquetadora recorta cada célula da folha.

export const SHELF_LABEL_PER_SHEET = 14;
export const SHELF_LABEL_COLUMNS = 2;
export const SHELF_LABEL_WIDTH_MM = 100;
export const SHELF_LABEL_HEIGHT_MM = 40;
const SHEET_TOP_MM = 6;
const SHEET_LEFT_MM = 5;

export type TPixelRect = { x: number; y: number; width: number; height: number };

/** Célula `index` (0-based, linha a linha) da folha, em px CSS (96 dpi). */
export function shelfLabelCellRect(index: number): TPixelRect {
	if (!Number.isInteger(index) || index < 0 || index >= SHELF_LABEL_PER_SHEET) {
		throw new RangeError(`Etiqueta fora da folha: ${index}`);
	}
	const column = index % SHELF_LABEL_COLUMNS;
	const row = Math.floor(index / SHELF_LABEL_COLUMNS);
	return {
		x: mmToPx(SHEET_LEFT_MM) + column * mmToPx(SHELF_LABEL_WIDTH_MM),
		y: mmToPx(SHEET_TOP_MM) + row * mmToPx(SHELF_LABEL_HEIGHT_MM),
		width: mmToPx(SHELF_LABEL_WIDTH_MM),
		height: mmToPx(SHELF_LABEL_HEIGHT_MM),
	};
}

/**
 * Retângulo em px CSS → px inteiros do canvas rasterizado com `pixelRatio`. As bordas são
 * arredondadas (não a largura), então células vizinhas encostam sem sobrepor nem deixar fresta.
 */
export function scaleRectToCanvas(rect: TPixelRect, pixelRatio: number): TPixelRect {
	const left = Math.round(rect.x * pixelRatio);
	const top = Math.round(rect.y * pixelRatio);
	const right = Math.round((rect.x + rect.width) * pixelRatio);
	const bottom = Math.round((rect.y + rect.height) * pixelRatio);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

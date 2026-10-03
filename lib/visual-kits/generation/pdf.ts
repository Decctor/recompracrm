import { PDFDocument } from "pdf-lib";
import { canvasToBlob } from "./images";
import { scaleRectToCanvas, SHELF_LABEL_HEIGHT_MM, SHELF_LABEL_PER_SHEET, SHELF_LABEL_WIDTH_MM, shelfLabelCellRect } from "./label-geometry";

const PT_PER_MM = 72 / 25.4;
const PT_PER_CSS_PX = 72 / 96;

export const PDF_A4_SIZE = { largura: 595.28, altura: 841.89 };
export const PDF_SHELF_LABEL_SIZE = { largura: SHELF_LABEL_WIDTH_MM * PT_PER_MM, altura: SHELF_LABEL_HEIGHT_MM * PT_PER_MM };
export const PDF_JPEG_QUALITY = 0.9;
const PDF_CREATOR = "Comunicação visual";

export type TPdfPageSize = { largura: number; altura: number }; // em pontos (1/72")

/** Página do tamanho da imagem: px CSS → pontos (72/96), descontando o pixel ratio do canvas. */
export function pdfPageSizeForCanvas(canvas: HTMLCanvasElement, pixelRatio: number): TPdfPageSize {
	return { largura: (canvas.width / pixelRatio) * PT_PER_CSS_PX, altura: (canvas.height / pixelRatio) * PT_PER_CSS_PX };
}

export type TVisualKitPdfBuilder = {
	/** Uma página com o canvas inteiro (JPEG) esticado para `size`. */
	addCanvasPage: (canvas: HTMLCanvasElement, size: TPdfPageSize) => Promise<void>;
	/**
	 * Recorta as `count` primeiras etiquetas de uma folha A4 de etiquetas de gôndola (rasterizada com
	 * `pixelRatio`) e adiciona uma página de 100 × 40 mm por etiqueta.
	 */
	addShelfLabelsFromSheet: (sheet: HTMLCanvasElement, args: { count: number; pixelRatio: number }) => Promise<void>;
	pageCount: () => number;
	save: () => Promise<Blob>;
};

async function canvasToJpegBytes(canvas: HTMLCanvasElement) {
	const blob = await canvasToBlob(canvas, "image/jpeg", PDF_JPEG_QUALITY);
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Monta o PDF página a página: cada canvas é embutido e pode ser descartado em seguida, então a
 * memória não cresce com folhas de 300 dpi (~35 MB cada) guardadas até o fim.
 */
export async function createVisualKitPdf({ titulo }: { titulo: string }): Promise<TVisualKitPdfBuilder> {
	const doc = await PDFDocument.create();
	doc.setTitle(titulo);
	doc.setCreator(PDF_CREATOR);
	doc.setProducer(PDF_CREATOR);
	const now = new Date();
	doc.setCreationDate(now);
	doc.setModificationDate(now);

	async function addCanvasPage(canvas: HTMLCanvasElement, size: TPdfPageSize) {
		const image = await doc.embedJpg(await canvasToJpegBytes(canvas));
		const page = doc.addPage([size.largura, size.altura]);
		page.drawImage(image, { x: 0, y: 0, width: size.largura, height: size.altura });
	}

	async function addShelfLabelsFromSheet(sheet: HTMLCanvasElement, { count, pixelRatio }: { count: number; pixelRatio: number }) {
		const labels = Math.min(Math.max(0, count), SHELF_LABEL_PER_SHEET);
		for (let index = 0; index < labels; index += 1) {
			const cell = scaleRectToCanvas(shelfLabelCellRect(index), pixelRatio);
			const crop = document.createElement("canvas");
			crop.width = cell.width;
			crop.height = cell.height;
			const context = crop.getContext("2d");
			if (!context) throw new Error("Não foi possível recortar as etiquetas.");
			context.fillStyle = "#ffffff";
			context.fillRect(0, 0, cell.width, cell.height);
			context.drawImage(sheet, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height);
			await addCanvasPage(crop, PDF_SHELF_LABEL_SIZE);
			crop.width = 0;
			crop.height = 0;
		}
	}

	return {
		addCanvasPage,
		addShelfLabelsFromSheet,
		pageCount: () => doc.getPageCount(),
		save: async () => {
			const bytes = await doc.save();
			return new Blob([bytes as BlobPart], { type: "application/pdf" });
		},
	};
}

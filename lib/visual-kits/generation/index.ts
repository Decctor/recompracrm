// Geração dos arquivos dos kits de comunicação visual, toda no navegador.
export { downloadBlob, downloadVisualKitZip, sha256Hex, type TVisualKitZipEntry, type TVisualKitZipProgress } from "./download";
export {
	kitZipName,
	padFileOrder,
	slugifyFileName,
	type TVisualKitFileExtension,
	VISUAL_KIT_PIECE_SLUGS,
	visualKitCarouselFileName,
	visualKitOutputExtension,
	visualKitPagedFileName,
	visualKitPieceFileName,
	visualKitPieceFolder,
	visualKitPieceFolderName,
	visualKitProductFileName,
} from "./file-names";
export {
	assertVisualKitOutput,
	generateVisualKit,
	type TGeneratedFile,
	type TGeneratedFileMimeType,
	type TGeneratedPiece,
	type TGenerationPieceInput,
	type TGenerationProgress,
} from "./generate";
export { proxyVisualKitImageUrl, VISUAL_KIT_IMAGE_PROXY_PATH, withProxiedImages } from "./image-proxy";
export { canvasToBlob, canvasToJpg, canvasToPng, VISUAL_KIT_JPG_QUALITY } from "./images";
export { scaleRectToCanvas, shelfLabelCellRect, type TPixelRect } from "./label-geometry";
export { createVisualKitPdf, PDF_A4_SIZE, PDF_SHELF_LABEL_SIZE, pdfPageSizeForCanvas, type TPdfPageSize, type TVisualKitPdfBuilder } from "./pdf";
export {
	mountOffscreen,
	prepareVisualKitRasterization,
	rasterizePage,
	VISUAL_KIT_PIXEL_RATIOS,
	VISUAL_KIT_PRINT_PIXEL_RATIO,
	yieldToEventLoop,
} from "./render";

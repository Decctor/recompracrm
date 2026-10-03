export const VISUAL_KIT_JPG_QUALITY = 0.92;

/** `canvas.toBlob` como promessa; falha (em vez de devolver nulo) quando o navegador não codifica. */
export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Não foi possível converter a imagem da peça."));
			},
			type,
			quality,
		);
	});
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return canvasToBlob(canvas, "image/png");
}

export function canvasToJpg(canvas: HTMLCanvasElement, quality = VISUAL_KIT_JPG_QUALITY): Promise<Blob> {
	return canvasToBlob(canvas, "image/jpeg", quality);
}

// Browser-side preparation of the files sent to /api/purchases/import-composition.

export const IMPORT_ACCEPTED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/xml", "text/xml"];
const MAX_FILE_BASE64_LENGTH = 4_200_000;
const IMAGE_MAX_DIMENSION = 2000;

export function isXmlFile(file: File) {
	return file.type === "application/xml" || file.type === "text/xml" || file.name.toLowerCase().endsWith(".xml");
}

export function isAcceptedImportFile(file: File) {
	return IMPORT_ACCEPTED_MIME_TYPES.includes(file.type) || isXmlFile(file);
}

function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(",") + 1));
		};
		reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
		reader.readAsDataURL(file);
	});
}

async function downscaleImageToJpegBase64(file: File): Promise<string> {
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Canvas indisponível.");
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
		return dataUrl.slice(dataUrl.indexOf(",") + 1);
	} catch {
		// Downscale is an optimization; fall back to the original bytes.
		return readFileAsBase64(file);
	}
}

export async function prepareImportFilePayload(file: File) {
	const isXml = isXmlFile(file);
	if (file.type === "application/pdf" || isXml) {
		const dataBase64 = await readFileAsBase64(file);
		if (dataBase64.length > MAX_FILE_BASE64_LENGTH) throw new Error("Arquivo muito grande. O limite é de aproximadamente 3MB por arquivo.");
		return { dataBase64, mimeType: isXml ? ("application/xml" as const) : ("application/pdf" as const), fileName: file.name };
	}
	const dataBase64 = await downscaleImageToJpegBase64(file);
	if (dataBase64.length > MAX_FILE_BASE64_LENGTH) throw new Error("Imagem muito grande mesmo após compressão. Tente uma foto menor.");
	return { dataBase64, mimeType: "image/jpeg" as const, fileName: file.name };
}

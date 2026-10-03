import type { TFileMetadata } from "@/schemas/files";
import createHttpError from "http-errors";
import sharp from "sharp";

export type TInspectedFile = { mimeType: string; metadados: TFileMetadata };

const IMAGE_MIME_BY_FORMAT: Record<string, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
};

/**
 * Valida uma imagem pelos BYTES — nunca pelo mime declarado ou pelo Content-Type de resposta —
 * e decodifica o conteúdo POR COMPLETO. A decodificação completa (`stats()`) é deliberada:
 * `metadata()` lê só o cabeçalho, e um JPEG/PNG truncado mantém cabeçalho válido com corpo de
 * lixo (foi exatamente assim que uma imagem cinza chegou a um template). `stats()` percorre
 * todos os pixels e falha em dados truncados.
 */
export async function inspectImageFile(buffer: Buffer, { allowedMimeTypes }: { allowedMimeTypes: ReadonlySet<string> }): Promise<TInspectedFile> {
	if (buffer.length === 0) throw new createHttpError.BadRequest("Conteúdo da imagem vazio.");
	try {
		const image = sharp(buffer, { failOn: "error" });
		const metadata = await image.metadata();
		const mimeType = metadata.format ? (IMAGE_MIME_BY_FORMAT[metadata.format] ?? null) : null;
		if (!mimeType || !allowedMimeTypes.has(mimeType)) throw new createHttpError.BadRequest("Envie uma imagem JPEG ou PNG.");
		if (!metadata.width || !metadata.height) throw new createHttpError.BadRequest("Não foi possível determinar as dimensões da imagem.");
		await image.stats();
		return { mimeType, metadados: { tipo: "IMAGEM", largura: metadata.width, altura: metadata.height } };
	} catch (error) {
		if (createHttpError.isHttpError(error)) throw error;
		throw new createHttpError.BadRequest("O arquivo enviado não é uma imagem válida ou está corrompido.");
	}
}

/**
 * Tipo real pelos primeiros bytes (assinatura do formato). Usado no upload direto, em que o
 * servidor não tem o arquivo em memória para decodificar: o conteúdo é conferido por tamanho e
 * SHA-256 contra o declarado, e o tipo pela assinatura — nunca pelo Content-Type do envio.
 */
export function sniffMimeType(head: Uint8Array): string | null {
	const startsWith = (signature: number[]) => signature.every((byte, index) => head[index] === byte);
	if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
	if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
	return null;
}

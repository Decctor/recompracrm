import { PRIVATE_FILES_BUCKET } from "@/lib/files-storage/buckets";
import { inspectImageFile, sniffMimeType, type TInspectedFile } from "@/lib/files/inspect";
import { findOrganizationFileBySha256, sanitizeFileName, sha256Hex, storeFile } from "@/lib/files/service";
import type { TFileEntity } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

/**
 * Arquivos da entrada fiscal (NF-e, CT-e, DANFE, cupom, foto da nota) no catálogo `files`.
 * Propósito de upload `DOCUMENTO_FISCAL_ENTRADA` e gravação direta pelo import compartilham estas
 * regras, para que o arquivo seja o mesmo venha do builder, do agente MCP ou do DF-e.
 */

export const FISCAL_ENTRY_DOCUMENT_MIME_TYPES = new Set(["application/xml", "text/xml", "application/pdf", "image/png", "image/jpeg", "image/webp"]);
const FISCAL_ENTRY_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Mesma barreira de lib/purchase/import-xml.ts: o parser roda com `processEntities: false`, mas a
// declaração em si já é sinal de arquivo que não veio da SEFAZ.
const UNSAFE_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
const FISCAL_XML_ROOT = /^\s*(?:<\?xml\b[^>]*\?>\s*)?<(?:\w+:)?(?:nfeProc|NFe|cteProc|CTe|procEventoNFe)\b/i;

export function getFiscalEntryDocumentPrefix({ organizacaoId }: { organizacaoId: string }) {
	return `organizations/${organizacaoId}/fiscal-entry/`;
}

export function looksLikeFiscalXml(head: string) {
	return FISCAL_XML_ROOT.test(head);
}

/**
 * Tipo real pelos bytes, nunca pelo mime declarado. XML precisa ter raiz de documento fiscal e
 * nenhuma declaração DTD/ENTITY; imagens são decodificadas por completo; PDF é conferido pela
 * assinatura (o conteúdo vai para o extrator visual, que falha sozinho em arquivo corrompido).
 */
export async function inspectFiscalEntryDocument(buffer: Buffer): Promise<TInspectedFile> {
	if (buffer.length === 0) throw new createHttpError.BadRequest("Arquivo vazio.");
	const sniffed = sniffMimeType(buffer.subarray(0, 16));
	if (sniffed === "application/pdf") return { mimeType: sniffed, metadados: null };
	if (sniffed && FISCAL_ENTRY_IMAGE_TYPES.has(sniffed)) return inspectImageFile(buffer, { allowedMimeTypes: FISCAL_ENTRY_IMAGE_TYPES });

	const head = buffer.subarray(0, 512).toString("utf8");
	// A declaração vem antes da raiz, então é conferida primeiro — senão um DOCTYPE esconderia a raiz
	// e o erro seria o genérico de "tipo não aceito".
	if (/^\s*</.test(head) && UNSAFE_XML_DECLARATION.test(buffer.toString("utf8")))
		throw new createHttpError.BadRequest("XML com declaração DTD ou ENTITY não é aceito.");
	if (looksLikeFiscalXml(head)) return { mimeType: "application/xml", metadados: null };
	throw new createHttpError.BadRequest("Envie o XML da NF-e/CT-e, um PDF ou uma imagem (PNG, JPEG ou WEBP).");
}

/**
 * Grava (ou reaproveita) o documento no bucket privado. O mesmo conteúdo enviado duas vezes pela
 * mesma organização aponta para a mesma linha de `files` — é o `sha256` que identifica o arquivo,
 * não o nome nem a hora do envio.
 */
export async function storeFiscalEntryDocument({
	organizacaoId,
	buffer,
	nomeOriginal,
}: {
	organizacaoId: string;
	buffer: Buffer;
	nomeOriginal?: string | null;
}): Promise<{ arquivo: TFileEntity; reutilizado: boolean }> {
	const inspected = await inspectFiscalEntryDocument(buffer);
	const existing = await findOrganizationFileBySha256({ organizacaoId, sha256: sha256Hex(buffer), bucket: PRIVATE_FILES_BUCKET });
	if (existing) return { arquivo: existing, reutilizado: true };

	const fileName = sanitizeFileName(nomeOriginal || "documento", inspected.mimeType);
	const arquivo = await storeFile({
		organizacaoId,
		bucket: PRIVATE_FILES_BUCKET,
		caminho: `${getFiscalEntryDocumentPrefix({ organizacaoId })}${crypto.randomUUID()}/${fileName}`,
		visibilidade: "PRIVADO",
		buffer,
		mimeType: inspected.mimeType,
		nomeOriginal: nomeOriginal ?? null,
		metadados: inspected.metadados,
	});
	return { arquivo, reutilizado: false };
}

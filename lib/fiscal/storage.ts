import "server-only";
import { createSignedPrivateFileUrl, createSignedPrivateFileUrls, downloadPrivateFile, storePrivateFile } from "@/lib/files-storage/private";
import { FISCAL_STORAGE_PREFIX } from "./constants";

export type TFiscalAssetType = "xml" | "pdf";

export function buildFiscalAssetPath({ documentoId, tipo, asset }: { documentoId: string; tipo: string; asset: TFiscalAssetType }) {
	const extension = asset === "xml" ? "xml" : "pdf";
	return `${FISCAL_STORAGE_PREFIX}/${documentoId}-${tipo.toLowerCase()}.${extension}`;
}

export function getFiscalAssetContentType(asset: TFiscalAssetType) {
	return asset === "xml" ? "application/xml" : "application/pdf";
}

export async function storeFiscalAsset({
	documentoId,
	tipo,
	asset,
	buffer,
}: {
	documentoId: string;
	tipo: string;
	asset: TFiscalAssetType;
	buffer: ArrayBuffer;
}) {
	const path = buildFiscalAssetPath({ documentoId, tipo, asset });
	const contentType = getFiscalAssetContentType(asset);
	return storePrivateFile({ path, data: buffer, contentType, upsert: true });
}

export async function downloadStoredFiscalAsset(path: string) {
	return downloadPrivateFile(path);
}

// URL do PDF da DANFE para o job de impressão do agente desktop (principal AGENTE_DESKTOP, sem
// sessão de usuário — a rota /api/fiscal/document-assets não serve). Assinada na hora do enqueue.
export async function createSignedFiscalAssetUrl({ storagePath, expiresInSeconds }: { storagePath: string; expiresInSeconds: number }) {
	return createSignedPrivateFileUrl({ path: storagePath, expiresInSeconds });
}

export async function createSignedFiscalAssetUrls({ storagePaths, expiresInSeconds }: { storagePaths: string[]; expiresInSeconds: number }) {
	return createSignedPrivateFileUrls({ paths: storagePaths, expiresInSeconds });
}

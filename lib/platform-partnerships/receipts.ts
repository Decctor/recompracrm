import "server-only";
import { createSignedPrivateFileUrl } from "@/lib/files-storage/private";

/**
 * Comprovante do PIX. `comprovanteUrl` guarda o caminho no bucket privado quando o admin sobe o
 * arquivo pelo painel; valores antigos podem ser uma URL externa (http). O parceiro e o admin nunca
 * recebem o caminho: abrem por uma rota que confere a posse e redireciona para uma URL assinada.
 */
export const PLATFORM_PARTNER_RECEIPT_CONTENT_TYPES: Record<string, string> = {
	"application/pdf": "pdf",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
export const PLATFORM_PARTNER_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function getPlatformPartnerReceiptPath({ partnerId, payoutId, extension }: { partnerId: string; payoutId: string; extension: string }) {
	return `platform-partner-receipts/${partnerId}/${payoutId}-${crypto.randomUUID()}.${extension}`;
}

export async function resolvePlatformPartnerReceiptUrl(comprovanteUrl: string) {
	if (/^https?:\/\//i.test(comprovanteUrl)) return comprovanteUrl;
	return createSignedPrivateFileUrl({ path: comprovanteUrl, expiresInSeconds: 5 * 60 });
}

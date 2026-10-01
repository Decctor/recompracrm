/**
 * Documentos do cadastro de parceiro (CPF/CNPJ). Ficam no bucket privado, sob um prefixo por
 * usuário: o onboarding só aceita caminhos desse prefixo, então ninguém aponta o próprio cadastro
 * para o arquivo de outra pessoa. O admin lê por URL assinada de curta duração.
 */
export const PLATFORM_PARTNER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const PLATFORM_PARTNER_DOCUMENT_CONTENT_TYPES: Record<string, string> = {
	"application/pdf": "pdf",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/heic": "heic",
	"image/heif": "heif",
};

export function getPlatformPartnerDocumentPrefix(userId: string) {
	return `platform-partners/${userId}/`;
}

export function isPlatformPartnerDocumentPathOwnedBy({ path, userId }: { path: string; userId: string }) {
	return path.startsWith(getPlatformPartnerDocumentPrefix(userId)) && !path.includes("..");
}

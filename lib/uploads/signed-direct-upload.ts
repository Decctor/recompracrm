/**
 * Envia um arquivo direto ao armazenamento pela URL assinada de `createDirectUploadIntake`
 * (lib/files/intake.ts) — sem passar pela função da Vercel e seu limite de corpo. Mesmo formato
 * do `uploadToSignedUrl` do storage-js (multipart com o blob tipado), sem precisar da chave do
 * cliente: o token da URL autoriza o envio. O servidor confere tamanho, SHA-256 e tipo depois.
 */
export async function uploadToSignedUrl({ signedUrl, blob, signal }: { signedUrl: string; blob: Blob; signal?: AbortSignal }) {
	const body = new FormData();
	body.append("cacheControl", "3600");
	body.append("", blob);
	const response = await fetch(signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" }, signal });
	if (!response.ok) throw new Error("Não foi possível enviar um dos arquivos. Verifique a conexão e tente de novo.");
}

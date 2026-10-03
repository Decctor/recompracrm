import "server-only";
import { PRIVATE_FILES_BUCKET } from "@/lib/files-storage/buckets";
import { getSupabaseAdminClient } from "@/services/supabase/admin";

export { PRIVATE_FILES_BUCKET };

export async function storePrivateFile({
	path,
	data,
	contentType,
	upsert = false,
}: {
	path: string;
	data: ArrayBuffer;
	contentType: string;
	upsert?: boolean;
}) {
	if (path.startsWith("/") || path.includes("..")) throw new Error("Caminho privado inválido.");
	const { data: uploaded, error } = await getSupabaseAdminClient().storage.from(PRIVATE_FILES_BUCKET).upload(path, data, { contentType, upsert });
	if (error) throw error;
	return uploaded.path;
}

export async function downloadPrivateFile(path: string) {
	if (path.startsWith("/") || path.includes("..")) throw new Error("Caminho privado inválido.");
	const { data, error } = await getSupabaseAdminClient().storage.from(PRIVATE_FILES_BUCKET).download(path);
	if (error) throw error;
	return data.arrayBuffer();
}

// URL assinada para consumidores sem sessão (ex.: agente desktop imprimindo DANFE) — a validade
// deve cobrir o ciclo de vida do consumidor (TTL do job de impressão), não ser "curta por padrão".
export async function createSignedPrivateFileUrl({ path, expiresInSeconds }: { path: string; expiresInSeconds: number }) {
	if (path.startsWith("/") || path.includes("..")) throw new Error("Caminho privado inválido.");
	const { data, error } = await getSupabaseAdminClient().storage.from(PRIVATE_FILES_BUCKET).createSignedUrl(path, expiresInSeconds);
	if (error) throw error;
	return data.signedUrl;
}

// Várias URLs assinadas numa chamada só (exportação em lote). Caminho que o storage não assina
// volta com `signedUrl: null` e `error` preenchido, sem derrubar o lote.
export async function createSignedPrivateFileUrls({ paths, expiresInSeconds }: { paths: string[]; expiresInSeconds: number }) {
	if (paths.length === 0) return [];
	for (const path of paths) {
		if (path.startsWith("/") || path.includes("..")) throw new Error("Caminho privado inválido.");
	}
	const { data, error } = await getSupabaseAdminClient().storage.from(PRIVATE_FILES_BUCKET).createSignedUrls(paths, expiresInSeconds);
	if (error) throw error;
	return data.map((entry) => ({ path: entry.path, signedUrl: entry.signedUrl || null, error: entry.error }));
}

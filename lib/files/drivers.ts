import type { TStorageProviderEnum } from "@/schemas/enums";
import createHttpError from "http-errors";

/**
 * Interface mínima que um provedor de armazenamento precisa cumprir. Todo acesso a bytes passa
 * por aqui — nenhum outro módulo importa cliente de storage diretamente. Trocar de fornecedor é
 * implementar um driver novo e migrar as linhas de `files` (ver README.md).
 */
export type TStorageDriver = {
	put: (input: { bucket: string; caminho: string; buffer: Buffer; mimeType: string }) => Promise<void>;
	get: (input: { bucket: string; caminho: string }) => Promise<Buffer>;
	publicUrl: (input: { bucket: string; caminho: string }) => Promise<string>;
	signedUrl: (input: { bucket: string; caminho: string; expiraEmSegundos: number }) => Promise<string>;
	remove: (input: { bucket: string; caminho: string }) => Promise<void>;
	/**
	 * URL para o CLIENTE enviar os bytes direto ao provedor (sem passar pela função da Vercel e seu
	 * limite de ~4.5 MB de corpo). O objeto só entra no catálogo depois de conferido no servidor —
	 * ver `completeDirectUpload` em intake.ts.
	 */
	createSignedUpload: (input: { bucket: string; caminho: string }) => Promise<{ signedUrl: string; token: string }>;
	/** Remove todos os objetos diretamente sob a "pasta" (envio direto abandonado). */
	removeFolder: (input: { bucket: string; pasta: string }) => Promise<void>;
};

async function getSupabaseStorage() {
	const { getSupabaseAdminClient } = await import("@/services/supabase/admin");
	return getSupabaseAdminClient().storage;
}

const supabaseDriver: TStorageDriver = {
	put: async ({ bucket, caminho, buffer, mimeType }) => {
		const storage = await getSupabaseStorage();
		const { error } = await storage.from(bucket).upload(caminho, buffer, { contentType: mimeType, upsert: false });
		if (error) throw new createHttpError.InternalServerError("Não foi possível gravar o arquivo no armazenamento.");
	},
	get: async ({ bucket, caminho }) => {
		const storage = await getSupabaseStorage();
		const { data, error } = await storage.from(bucket).download(caminho);
		if (error || !data) throw new createHttpError.NotFound("Arquivo não encontrado no armazenamento.");
		return Buffer.from(await data.arrayBuffer());
	},
	publicUrl: async ({ bucket, caminho }) => {
		const storage = await getSupabaseStorage();
		return storage.from(bucket).getPublicUrl(caminho).data.publicUrl;
	},
	signedUrl: async ({ bucket, caminho, expiraEmSegundos }) => {
		const storage = await getSupabaseStorage();
		const { data, error } = await storage.from(bucket).createSignedUrl(caminho, expiraEmSegundos);
		if (error || !data) throw new createHttpError.InternalServerError("Não foi possível gerar a URL assinada do arquivo.");
		return data.signedUrl;
	},
	remove: async ({ bucket, caminho }) => {
		const storage = await getSupabaseStorage();
		const { error } = await storage.from(bucket).remove([caminho]);
		if (error) throw new createHttpError.InternalServerError("Não foi possível remover o arquivo do armazenamento.");
	},
	createSignedUpload: async ({ bucket, caminho }) => {
		const storage = await getSupabaseStorage();
		const { data, error } = await storage.from(bucket).createSignedUploadUrl(caminho, { upsert: false });
		if (error || !data) throw new createHttpError.InternalServerError("Não foi possível preparar o envio do arquivo.");
		return { signedUrl: data.signedUrl, token: data.token };
	},
	removeFolder: async ({ bucket, pasta }) => {
		const storage = await getSupabaseStorage();
		const { data, error } = await storage.from(bucket).list(pasta);
		if (error) throw new createHttpError.InternalServerError("Não foi possível listar os arquivos do armazenamento.");
		const paths = (data ?? []).map((object) => `${pasta.replace(/\/$/, "")}/${object.name}`);
		if (paths.length) await storage.from(bucket).remove(paths);
	},
};

const DRIVERS: Record<TStorageProviderEnum, TStorageDriver> = {
	SUPABASE: supabaseDriver,
};

export function getStorageDriver(provedor: TStorageProviderEnum): TStorageDriver {
	return DRIVERS[provedor];
}

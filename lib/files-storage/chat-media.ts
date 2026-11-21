import { supabaseClient } from "@/services/supabase";

export const SUPABASE_STORAGE_CHAT_MEDIA_BUCKET = "files";

type ChatMediaType = "IMAGEM" | "VIDEO" | "AUDIO" | "DOCUMENTO";

type UploadChatMediaParams = {
	file: Buffer | Blob;
	organizacaoId: string;
	chatId: string;
	mimeType: string;
	filename?: string;
};

type UploadChatMediaResult = {
	storageId: string;
	publicUrl: string;
	mimeType: string;
	fileSize: number;
	filename: string;
};

/**
 * Maps mime type to chat media type
 */
export function getMimeTypeCategory(mimeType: string): ChatMediaType {
	if (mimeType.startsWith("image/")) return "IMAGEM";
	if (mimeType.startsWith("video/")) return "VIDEO";
	if (mimeType.startsWith("audio/")) return "AUDIO";
	return "DOCUMENTO";
}

/**
 * Generate a unique storage path for chat media
 */
function generateStoragePath(organizacaoId: string, chatId: string, filename: string): string {
	const timestamp = Date.now();
	const sanitizedFilename = filename
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9._-]/g, "_")
		.toLowerCase();
	return `/public/${organizacaoId}/${chatId}/${timestamp}_${sanitizedFilename}`;
}

/**
 * Upload media to Supabase Storage for chat
 */
export async function uploadChatMedia({
	file,
	organizacaoId,
	chatId,
	mimeType,
	filename = "arquivo",
}: UploadChatMediaParams): Promise<UploadChatMediaResult> {
	const storagePath = generateStoragePath(organizacaoId, chatId, filename);

	// Convert Buffer to Blob if needed
	const fileBlob = Buffer.isBuffer(file) ? new Blob([new Uint8Array(file)], { type: mimeType }) : file;

	const { data, error } = await supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).upload(storagePath, fileBlob, {
		contentType: mimeType,
	});

	if (error) {
		console.error("[CHAT_MEDIA] Upload error:", error);
		throw new Error(`Falha ao fazer upload do arquivo: ${error.message}`);
	}

	const {
		data: { publicUrl },
	} = supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).getPublicUrl(storagePath);

	const fileSize = Buffer.isBuffer(file) ? file.length : file.size;

	return {
		storageId: data.path,
		publicUrl,
		mimeType,
		fileSize,
		filename,
	};
}

/**
 * Get public URL for a stored media file
 */
export function getChatMediaUrl(storageId: string): string {
	const {
		data: { publicUrl },
	} = supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).getPublicUrl(storageId);
	return publicUrl;
}

/**
 * Get signed URL for a stored media file (for private buckets)
 */
export async function getChatMediaSignedUrl(storageId: string, expiresIn = 3600): Promise<string> {
	const { data, error } = await supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).createSignedUrl(storageId, expiresIn);

	if (error) {
		console.error("[CHAT_MEDIA] Signed URL error:", error);
		throw new Error(`Falha ao gerar URL assinada: ${error.message}`);
	}

	return data.signedUrl;
}

export type TFetchedWhatsappMedia = {
	fileBuffer: Buffer;
	mimeType: string;
	fileSize: number;
};

/**
 * Baixa a mídia da Graph API, sem gravar. Não depende do chat: o webhook dispara esta etapa
 * junto com a resolução do chat e só espera por ela na hora do upload (`storeWhatsappMedia`).
 */
export async function fetchWhatsappMedia({
	mediaId,
	mimeType,
	whatsappToken,
}: {
	mediaId: string;
	mimeType: string;
	whatsappToken: string;
}): Promise<TFetchedWhatsappMedia> {
	// Step 1: Get media URL from WhatsApp
	const mediaUrlResponse = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
		headers: {
			Authorization: `Bearer ${whatsappToken}`,
		},
	});

	if (!mediaUrlResponse.ok) {
		throw new Error(`Failed to get media URL from WhatsApp: ${mediaUrlResponse.statusText}`);
	}

	const mediaUrlData = await mediaUrlResponse.json();
	const mediaUrl = mediaUrlData.url;

	// Step 2: Download the media file
	const mediaResponse = await fetch(mediaUrl, {
		headers: {
			Authorization: `Bearer ${whatsappToken}`,
		},
	});

	if (!mediaResponse.ok) {
		throw new Error(`Failed to download media from WhatsApp: ${mediaResponse.statusText}`);
	}

	const fileBuffer = Buffer.from(await mediaResponse.arrayBuffer());
	const actualMimeType = mediaResponse.headers.get("content-type") || mimeType;
	const fileSize = Number.parseInt(mediaResponse.headers.get("content-length") || "0", 10);

	return { fileBuffer, mimeType: actualMimeType, fileSize };
}

/** Grava no Storage, no caminho do chat, a mídia que `fetchWhatsappMedia` baixou. */
export async function storeWhatsappMedia({
	media,
	mediaId,
	filename,
	organizacaoId,
	chatId,
}: {
	media: TFetchedWhatsappMedia;
	mediaId: string;
	filename?: string;
	organizacaoId: string;
	chatId: string;
}): Promise<UploadChatMediaResult> {
	const result = await uploadChatMedia({
		file: media.fileBuffer,
		organizacaoId,
		chatId,
		mimeType: media.mimeType,
		filename: filename || `media_${mediaId}`,
	});

	return {
		...result,
		fileSize: media.fileSize || result.fileSize,
	};
}

/**
 * Delete media from Supabase Storage
 */
export async function deleteChatMedia(storageId: string): Promise<void> {
	const { error } = await supabaseClient.storage.from(SUPABASE_STORAGE_CHAT_MEDIA_BUCKET).remove([storageId]);

	if (error) {
		console.error("[CHAT_MEDIA] Delete error:", error);
		throw new Error(`Falha ao deletar arquivo: ${error.message}`);
	}
}

/**
 * Upload media file to WhatsApp for sending
 */
export async function uploadMediaToWhatsapp({
	fileBuffer,
	mimeType,
	filename,
	fromPhoneNumberId,
	whatsappToken,
}: {
	fileBuffer: Buffer;
	mimeType: string;
	filename: string;
	fromPhoneNumberId: string;
	whatsappToken: string;
}): Promise<{ mediaId: string }> {
	const formData = new FormData();
	formData.append("file", new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), filename);
	formData.append("messaging_product", "whatsapp");
	formData.append("type", mimeType);

	const response = await fetch(`https://graph.facebook.com/v21.0/${fromPhoneNumberId}/media`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${whatsappToken}`,
		},
		body: formData,
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(`Failed to upload media to WhatsApp: ${JSON.stringify(errorData)}`);
	}

	const data = await response.json();
	return { mediaId: data.id };
}

/** Baixa da Graph API e grava no chat, em sequência (usado por scripts de recuperação). */
export async function downloadAndStoreWhatsappMedia({
	mediaId,
	mimeType,
	filename,
	organizacaoId,
	chatId,
	whatsappToken,
}: {
	mediaId: string;
	mimeType: string;
	filename?: string;
	organizacaoId: string;
	chatId: string;
	whatsappToken: string;
}): Promise<UploadChatMediaResult> {
	const media = await fetchWhatsappMedia({ mediaId, mimeType, whatsappToken });
	return storeWhatsappMedia({ media, mediaId, filename, organizacaoId, chatId });
}

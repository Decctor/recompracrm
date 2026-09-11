import axios from "axios";
import createHttpError from "http-errors";
import type { TWhatsappTemplateSendPayload } from "@/lib/message-templates/channels/whatsapp/types";

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v22.0";

function getMetaGraphAPIUrl(whatsappPhoneNumberId: string) {
	return {
		GRAPH_MESSAGES_API_URL: `https://graph.facebook.com/v22.0/${whatsappPhoneNumberId}/messages`,
		GRAPH_MEDIA_API_URL: `https://graph.facebook.com/v22.0/${whatsappPhoneNumberId}/media`,
	};
}
type SendBasicWhatsappMessageParams = {
	fromPhoneNumberId: string;
	toPhoneNumber: string;
	content: string;
	whatsappToken: string;
};

type SendBasicWhatsappMessageResponse = {
	data: {
		messaging_product: string;
		contacts: Array<{ input: string; wa_id: string }>;
		messages: Array<{ id: string }>;
	};
	message: string;
	whatsappMessageId: string;
};

export async function sendBasicWhatsappMessage({
	fromPhoneNumberId,
	toPhoneNumber,
	content,
	whatsappToken,
}: SendBasicWhatsappMessageParams): Promise<SendBasicWhatsappMessageResponse> {
	try {
		console.log("[INFO] [WHATSAPP_BASIC_SEND] Sending message:", toPhoneNumber, content);
		if (!whatsappToken) {
			throw new createHttpError.InternalServerError("WhatsApp auth token não configurado.");
		}
		const { GRAPH_MESSAGES_API_URL } = getMetaGraphAPIUrl(fromPhoneNumberId);

		const response = await axios.post(
			GRAPH_MESSAGES_API_URL,
			{
				messaging_product: "whatsapp",
				recipient_type: "individual",
				to: toPhoneNumber,
				type: "text",
				text: {
					preview_url: false,
					body: content,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${whatsappToken}`,
					"Content-Type": "application/json",
				},
			},
		);

		const whatsappMessageId = response.data.messages?.[0]?.id;
		if (!whatsappMessageId) {
			throw new createHttpError.InternalServerError("WhatsApp message ID não retornado.");
		}

		return {
			data: response.data,
			message: "Mensagem enviada com sucesso !",
			whatsappMessageId,
		};
	} catch (error) {
		console.error("[ERROR] [WHATSAPP_BASIC_SEND_ERROR]", error);
		if (axios.isAxiosError(error)) {
			console.error("[ERROR] [WHATSAPP_BASIC_SEND_ERROR_RESPONSE]", error.response?.data);
		}
		throw new createHttpError.InternalServerError("Oops, algo deu errado ao enviar a mensagem.");
	}
}

type SendTemplateWhatsappMessageParams = {
	fromPhoneNumberId: string;
	templatePayload: TWhatsappTemplateSendPayload | Record<string, unknown>;
	whatsappToken: string;
};

type SendTemplateWhatsappMessageResponse = {
	data: {
		messaging_product: string;
		contacts: Array<{ input: string; wa_id: string }>;
		messages: Array<{ id: string }>;
	};
	message: string;
	whatsappMessageId: string;
};

export async function sendTemplateWhatsappMessage({
	fromPhoneNumberId,
	templatePayload,
	whatsappToken,
}: SendTemplateWhatsappMessageParams): Promise<SendTemplateWhatsappMessageResponse> {
	try {
		if (!whatsappToken) {
			throw new createHttpError.InternalServerError("WhatsApp auth token não configurado.");
		}

		const { GRAPH_MESSAGES_API_URL } = getMetaGraphAPIUrl(fromPhoneNumberId);
		const response = await axios.post(GRAPH_MESSAGES_API_URL, templatePayload, {
			headers: {
				Authorization: `Bearer ${whatsappToken}`,
				"Content-Type": "application/json",
			},
		});

		const whatsappMessageId = response.data.messages?.[0]?.id;
		if (!whatsappMessageId) {
			throw new createHttpError.InternalServerError("WhatsApp message ID não retornado.");
		}

		return {
			data: response.data,
			message: "Template enviado com sucesso !",
			whatsappMessageId,
		};
	} catch (error) {
		console.error("[ERROR] [WHATSAPP_TEMPLATE_SEND_ERROR]", error);
		if (axios.isAxiosError(error)) {
			console.error("[ERROR] [WHATSAPP_TEMPLATE_SEND_ERROR_RESPONSE]", error.response?.data);
		}
		throw new createHttpError.InternalServerError("Oops, algo deu errado ao enviar o template.");
	}
}

type SendMediaWhatsappMessageParams = {
	fromPhoneNumberId: string;
	toPhoneNumber: string;
	/**
	 * `id` = mídia já hospedada na Meta por upload prévio; `link` = URL pública que a **Meta**
	 * busca sozinha. O link dispensa o upload e é o caminho do agente de IA, cujo anexo vem de
	 * uma URL que nunca passou pelo nosso storage.
	 */
	media: { id: string } | { link: string };
	mediaType: "image" | "video" | "document" | "audio";
	caption?: string;
	filename?: string;
	whatsappToken: string;
};

type SendMediaWhatsappMessageResponse = {
	data: {
		messaging_product: string;
		contacts: Array<{ input: string; wa_id: string }>;
		messages: Array<{ id: string }>;
	};
	message: string;
	whatsappMessageId: string;
};

export async function sendMediaWhatsappMessage({
	fromPhoneNumberId,
	toPhoneNumber,
	media,
	mediaType,
	caption,
	filename,
	whatsappToken,
}: SendMediaWhatsappMessageParams): Promise<SendMediaWhatsappMessageResponse> {
	try {
		console.log("[INFO] [WHATSAPP_MEDIA_SEND] Sending media message:", toPhoneNumber, mediaType, "id" in media ? media.id : media.link);
		if (!whatsappToken) {
			throw new createHttpError.InternalServerError("WhatsApp auth token não configurado.");
		}

		const { GRAPH_MESSAGES_API_URL } = getMetaGraphAPIUrl(fromPhoneNumberId);
		const mediaPayload: Record<string, string> = "id" in media ? { id: media.id } : { link: media.link };

		// Áudio é o único tipo sem legenda na API da Meta.
		if (caption && mediaType !== "audio") {
			mediaPayload.caption = caption;
		}

		// Add filename for documents
		if (mediaType === "document" && filename) {
			mediaPayload.filename = filename;
		}

		const payload = {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: toPhoneNumber,
			type: mediaType,
			[mediaType]: mediaPayload,
		};

		const response = await axios.post(GRAPH_MESSAGES_API_URL, payload, {
			headers: {
				Authorization: `Bearer ${whatsappToken}`,
				"Content-Type": "application/json",
			},
		});

		const whatsappMessageId = response.data.messages?.[0]?.id;
		if (!whatsappMessageId) {
			throw new createHttpError.InternalServerError("WhatsApp message ID não retornado.");
		}

		return {
			data: response.data,
			message: "Mídia enviada com sucesso!",
			whatsappMessageId,
		};
	} catch (error) {
		console.error("[ERROR] [WHATSAPP_MEDIA_SEND_ERROR]", error);
		if (axios.isAxiosError(error)) {
			console.error("[ERROR] [WHATSAPP_MEDIA_SEND_ERROR_RESPONSE]", error.response?.data);
		}
		throw new createHttpError.InternalServerError("Oops, algo deu errado ao enviar a mídia.");
	}
}

type UploadMediaToWhatsappParams = {
	fromPhoneNumberId: string;
	fileBuffer: Buffer;
	mimeType: string;
	filename: string;
	whatsappToken: string;
};

type UploadMediaToWhatsappResponse = {
	mediaId: string;
	message: string;
};

export async function uploadMediaToWhatsapp({
	fromPhoneNumberId,
	fileBuffer,
	mimeType,
	filename,
	whatsappToken,
}: UploadMediaToWhatsappParams): Promise<UploadMediaToWhatsappResponse> {
	try {
		console.log("[INFO] [WHATSAPP_MEDIA_UPLOAD] Uploading media:", filename, mimeType);

		const { GRAPH_MEDIA_API_URL } = getMetaGraphAPIUrl(fromPhoneNumberId);
		const formData = new FormData();
		formData.append("messaging_product", "whatsapp");

		// Create a proper Blob with the correct MIME type
		// Convert Buffer to ArrayBuffer, then to Blob to ensure proper MIME type handling
		const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer;
		const fileBlob = new Blob([arrayBuffer], { type: mimeType });

		// Append file with filename as third parameter
		// Note: The MIME type is set in the Blob itself, not as a separate field
		formData.append("file", fileBlob, filename);

		console.log("[INFO] [WHATSAPP_MEDIA_UPLOAD] Uploading file:", {
			filename,
			mimeType,
			fileSize: fileBlob.size,
		});

		// Use fetch instead of axios for better FormData handling in this environment
		const response = await fetch(GRAPH_MEDIA_API_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${whatsappToken}`,
				// Do NOT set Content-Type header manually - fetch will set it with boundary
			},
			body: formData,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			console.error("[ERROR] [WHATSAPP_MEDIA_UPLOAD_ERROR_RESPONSE]", errorData);
			throw new Error(`WhatsApp API error: ${response.status} ${response.statusText}`);
		}

		const responseData = await response.json();
		const mediaId = responseData.id;

		if (!mediaId) {
			throw new createHttpError.InternalServerError("WhatsApp media ID não retornado.");
		}

		console.log("[INFO] [WHATSAPP_MEDIA_UPLOAD] Successfully uploaded media to WhatsApp:", {
			mediaId,
			mimeType,
			filename,
		});
		return {
			mediaId,
			message: "Mídia enviada para WhatsApp com sucesso!",
		};
	} catch (error) {
		console.error("[ERROR] [WHATSAPP_MEDIA_UPLOAD_ERROR]", error);
		if (axios.isAxiosError(error)) {
			console.error("[ERROR] [WHATSAPP_MEDIA_UPLOAD_ERROR_RESPONSE]", error.response?.data);
		}
		throw new createHttpError.InternalServerError("Oops, algo deu errado ao fazer upload da mídia.");
	}
}

type DownloadMediaFromWhatsappParams = {
	mediaId: string;
	whatsappToken: string;
};

type DownloadMediaFromWhatsappResponse = {
	fileBuffer: Buffer;
	mimeType: string;
	fileSize: number;
};

export async function downloadMediaFromWhatsapp({
	mediaId,
	whatsappToken,
}: DownloadMediaFromWhatsappParams): Promise<DownloadMediaFromWhatsappResponse> {
	try {
		console.log("[INFO] [WHATSAPP_MEDIA_DOWNLOAD] Downloading media:", mediaId);

		// First, get the media URL
		const mediaInfoResponse = await axios.get(`${GRAPH_API_BASE_URL}/${mediaId}`, {
			headers: {
				Authorization: `Bearer ${whatsappToken}`,
			},
		});

		const mediaUrl = mediaInfoResponse.data.url;
		const mimeType = mediaInfoResponse.data.mime_type;
		const fileSize = mediaInfoResponse.data.file_size;

		if (!mediaUrl) {
			throw new createHttpError.InternalServerError("URL da mídia não encontrada.");
		}

		// Then download the actual file
		const fileResponse = await axios.get(mediaUrl, {
			headers: {
				Authorization: `Bearer ${whatsappToken}`,
			},
			responseType: "arraybuffer",
		});

		return {
			fileBuffer: Buffer.from(fileResponse.data),
			mimeType,
			fileSize,
		};
	} catch (error) {
		console.error("[ERROR] [WHATSAPP_MEDIA_DOWNLOAD_ERROR]", error);
		if (axios.isAxiosError(error)) {
			console.error("[ERROR] [WHATSAPP_MEDIA_DOWNLOAD_ERROR_RESPONSE]", error.response?.data);
		}
		throw new createHttpError.InternalServerError("Oops, algo deu errado ao baixar a mídia.");
	}
}

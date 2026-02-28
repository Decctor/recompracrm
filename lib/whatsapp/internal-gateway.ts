import type { TemplateParameter, TemplatePayload } from "@/lib/whatsapp/templates";
import axios from "axios";
import createHttpError from "http-errors";

// Environment variables
const GATEWAY_URL = process.env.INTERNAL_WHATSAPP_GATEWAY_URL;
const GATEWAY_API_SECRET = process.env.INTERNAL_WHATSAPP_GATEWAY_API_SECRET;

// Types
export type ConnectionStatus = "disconnected" | "connecting" | "qr" | "connected";
export type GatewayEnabledEvent = "connection.update" | "message.received" | "message.sent" | "message.updated" | "message.queue_failed";
export const DEFAULT_GATEWAY_ENABLED_EVENTS: GatewayEnabledEvent[] = [
	"connection.update",
	"message.sent",
	"message.updated",
	"message.queue_failed",
];

export type InitSessionResponse = {
	sessionId: string;
	status: ConnectionStatus;
	qrCode?: string;
	enabledEvents?: GatewayEnabledEvent[];
};

export type SessionInfo = {
	sessionId: string;
	status: ConnectionStatus;
	qrCode?: string;
	connectedAt?: string;
	phoneNumber?: string;
};

export type SendMessageResponse = {
	success: boolean;
	queued?: boolean;
	jobId?: string;
	clientMessageId?: string;
	error?: string;
};

export type SendMessageContent =
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "image" | "video" | "audio" | "document" | "sticker";
			text?: string;
			mediaUrl: string;
			mediaFileName?: string;
			mediaMimeType?: string;
			mediaIsVoiceNote?: boolean;
	  };

export type SendMessageInput = {
	sessionId: string;
	to: string;
	content: SendMessageContent;
	clientMessageId?: string;
};

export function parseTemplatePayloadToGatewayContent(templatePayload: TemplatePayload, options?: { fallbackText?: string }): SendMessageContent {
	console.log("[INTERNAL_GATEWAY] Template payload", JSON.stringify(templatePayload, null, 2));
	const components = templatePayload.template.components ?? [];
	let media:
		| {
				type: "image" | "video" | "document";
				url: string;
				filename?: string;
		  }
		| undefined;

	const isImageParam = (param: TemplateParameter): param is Extract<TemplateParameter, { type: "image" }> => {
		const image = (param as { image?: { link?: unknown } }).image;
		return param.type === "image" && typeof image?.link === "string";
	};
	const isVideoParam = (param: TemplateParameter): param is Extract<TemplateParameter, { type: "video" }> => {
		const video = (param as { video?: { link?: unknown } }).video;
		return param.type === "video" && typeof video?.link === "string";
	};
	const isDocumentParam = (param: TemplateParameter): param is Extract<TemplateParameter, { type: "document" }> => {
		const document = (param as { document?: { link?: unknown } }).document;
		return param.type === "document" && typeof document?.link === "string";
	};

	// Extract media from parameters if present
	for (const component of components) {
		if (!component.parameters?.length) continue;
		for (const param of component.parameters) {
			if (!media && isImageParam(param)) {
				media = { type: "image", url: param.image.link };
			} else if (!media && isVideoParam(param)) {
				media = { type: "video", url: param.video.link };
			} else if (!media && isDocumentParam(param)) {
				media = { type: "document", url: param.document.link, filename: param.document.filename };
			}
		}
	}

	// For internal gateway, use the pre-formatted template text (fallbackText) as the main content
	// The official WhatsApp API payload only contains parameters, not the full text
	const text = options?.fallbackText ?? templatePayload.template.name ?? "";

	if (media) {
		return {
			type: media.type,
			text: text || undefined,
			mediaUrl: media.url,
			mediaFileName: media.filename,
		};
	}

	return {
		type: "text",
		text,
	};
}

export type HealthCheckResponse = {
	status: "ok" | "error";
	version?: string;
};

function getGatewayHeaders() {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${GATEWAY_API_SECRET}`,
	};
}

function validateGatewayConfig() {
	if (!GATEWAY_URL) {
		throw new createHttpError.InternalServerError("INTERNAL_WHATSAPP_GATEWAY_URL not configured");
	}
	if (!GATEWAY_API_SECRET) {
		throw new createHttpError.InternalServerError("INTERNAL_WHATSAPP_GATEWAY_API_SECRET not configured");
	}
}

/**
 * Generate a unique session ID for an organization
 */
export function generateSessionId(orgId: string): string {
	return `org-${orgId}-${Date.now()}`;
}

/**
 * Initialize a new WhatsApp session
 * Returns QR code for scanning
 */
export async function initSession(sessionId: string, options?: { enabledEvents?: GatewayEnabledEvent[] }): Promise<InitSessionResponse> {
	validateGatewayConfig();

	try {
		console.log("[INTERNAL_GATEWAY] Initializing session:", sessionId);

		const response = await axios.post<InitSessionResponse>(
			`${GATEWAY_URL}/sessions/init`,
			{
				sessionId,
				enabledEvents: options?.enabledEvents ?? DEFAULT_GATEWAY_ENABLED_EVENTS,
			},
			{ headers: getGatewayHeaders() },
		);

		console.log("[INTERNAL_GATEWAY] Session initialized:", response.data);
		return response.data;
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Error initializing session:", error);
		if (axios.isAxiosError(error)) {
			console.error("[INTERNAL_GATEWAY] Response:", error.response?.data);
			throw new createHttpError.InternalServerError(error.response?.data?.error || "Erro ao inicializar sessão do WhatsApp");
		}
		throw new createHttpError.InternalServerError("Erro ao conectar com o Gateway interno");
	}
}

/**
 * Get the status of an existing session
 * Returns current status and optionally a new QR code
 */
export async function getSessionStatus(sessionId: string): Promise<SessionInfo> {
	validateGatewayConfig();

	try {
		console.log("[INTERNAL_GATEWAY] Getting session status:", sessionId);

		const response = await axios.get<SessionInfo>(`${GATEWAY_URL}/sessions/${sessionId}`, {
			headers: getGatewayHeaders(),
		});

		console.log("[INTERNAL_GATEWAY] Session status:", response.data);
		return response.data;
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Error getting session status:", error);
		if (axios.isAxiosError(error)) {
			if (error.response?.status === 404) {
				return {
					sessionId,
					status: "disconnected",
				};
			}
			console.error("[INTERNAL_GATEWAY] Response:", error.response?.data);
			throw new createHttpError.InternalServerError(error.response?.data?.error || "Erro ao obter status da sessão");
		}
		throw new createHttpError.InternalServerError("Erro ao conectar com o Gateway interno");
	}
}

/**
 * Delete/disconnect a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
	validateGatewayConfig();

	try {
		console.log("[INTERNAL_GATEWAY] Deleting session:", sessionId);

		await axios.delete(`${GATEWAY_URL}/sessions/${sessionId}`, {
			headers: getGatewayHeaders(),
		});

		console.log("[INTERNAL_GATEWAY] Session deleted:", sessionId);
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Error deleting session:", error);
		if (axios.isAxiosError(error)) {
			// 404 is acceptable - session might already be gone
			if (error.response?.status === 404) {
				console.log("[INTERNAL_GATEWAY] Session already deleted or not found");
				return;
			}
			console.error("[INTERNAL_GATEWAY] Response:", error.response?.data);
			throw new createHttpError.InternalServerError(error.response?.data?.error || "Erro ao desconectar sessão");
		}
		throw new createHttpError.InternalServerError("Erro ao conectar com o Gateway interno");
	}
}

/**
 * Send a text message via Internal Gateway
 */
export async function sendMessage(
	sessionId: string,
	to: string,
	content: SendMessageContent,
	options?: { clientMessageId?: string },
): Promise<SendMessageResponse> {
	validateGatewayConfig();

	try {
		const messageLength = content.type === "text" ? content.text.length : content.text?.length;
		console.log("[INTERNAL_GATEWAY] Sending message:", { sessionId, to, messageLength });

		const response = await axios.post<SendMessageResponse>(
			`${GATEWAY_URL}/messages/send`,
			{
				sessionId,
				to,
				content,
				clientMessageId: options?.clientMessageId,
			},
			{ headers: getGatewayHeaders() },
		);

		console.log("[INTERNAL_GATEWAY] Message sent:", response.data);
		return response.data;
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Error sending message:", error);
		if (axios.isAxiosError(error)) {
			console.error("[INTERNAL_GATEWAY] Response:", error.response?.data);

			// Check for specific error conditions
			if (error.response?.status === 404) {
				throw new createHttpError.BadRequest("Sessão do WhatsApp não encontrada ou desconectada");
			}
			if (error.response?.status === 400) {
				throw new createHttpError.BadRequest(error.response?.data?.error || "Erro ao enviar mensagem");
			}

			throw new createHttpError.InternalServerError(error.response?.data?.error || "Erro ao enviar mensagem via Gateway");
		}
		throw new createHttpError.InternalServerError("Erro ao conectar com o Gateway interno");
	}
}

/**
 * Check gateway health
 */
export async function healthCheck(): Promise<HealthCheckResponse> {
	validateGatewayConfig();

	try {
		const response = await axios.get<HealthCheckResponse>(`${GATEWAY_URL}/health`, {
			headers: getGatewayHeaders(),
			timeout: 5000,
		});

		return response.data;
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Health check failed:", error);
		return { status: "error" };
	}
}

/**
 * Download media from Internal Gateway
 */
export async function downloadMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
	validateGatewayConfig();

	try {
		console.log("[INTERNAL_GATEWAY] Downloading media:", mediaUrl);

		const response = await axios.get(mediaUrl, {
			headers: getGatewayHeaders(),
			responseType: "arraybuffer",
		});

		const mimeType = response.headers["content-type"] || "application/octet-stream";

		return {
			buffer: Buffer.from(response.data),
			mimeType,
		};
	} catch (error) {
		console.error("[INTERNAL_GATEWAY] Error downloading media:", error);
		throw new createHttpError.InternalServerError("Erro ao baixar mídia do Gateway interno");
	}
}

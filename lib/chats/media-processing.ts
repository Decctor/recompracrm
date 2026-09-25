import { handleAIAudioProcessing, handleAIDocumentProcessing, handleAIImageProcessing, handleAIVideoProcessing } from "@/lib/ai/ai-media-processing";
import { isAiGatewayCreditError, notifyAiGatewayCreditExhausted } from "@/lib/ai/providers/credit-alert";
import { STICKER_PROCESSED_TEXT } from "@/lib/chats/sticker";
import type { TChatMessageMetadata } from "@/schemas/chats";
import type { TChatMessageContentTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema";
import { supabaseClient } from "@/services/supabase";
import { eq } from "drizzle-orm";

const FAILURE_REASON_MAX_LENGTH = 300;

export type TChatMediaProcessingResult =
	| { status: "processed"; processedText: string; summary: string }
	| { status: "skipped" }
	| { status: "failed"; error: string };

/**
 * Transcreve/descreve a mídia de uma mensagem e grava o texto na própria mensagem.
 *
 * **Nunca lança.** Até 2026-09-24 os dois webhooks (Meta e gateway interno) tinham cada um a sua
 * cópia desta função, e as duas relançavam o erro antes de o turno de IA ser despachado: uma falha
 * no gateway de IA fazia o cliente que mandou um áudio ficar sem resposta nenhuma, e o evento
 * inteiro ia para FALHOU. Agora o desfecho fica na mensagem (`metadados.whatsappMidia.processingStatus`)
 * e o chamador segue: a IA responde dizendo que não conseguiu abrir o áudio, o que é melhor do
 * que silêncio.
 *
 * Idempotente por construção: rodar de novo sobre uma mensagem já processada só reescreve o
 * mesmo texto — é o que o script de reprocessamento usa depois de uma queda do gateway.
 */
export async function processChatMessageMedia({
	messageId,
	organizacaoId,
	storageId,
	mimeType,
	mediaType,
	log = "[MEDIA_PROCESSING]",
}: {
	messageId: string;
	organizacaoId?: string | null;
	storageId: string;
	mimeType: string;
	mediaType: Exclude<TChatMessageContentTypeEnum, "TEXTO">;
	log?: string;
}): Promise<TChatMediaProcessingResult> {
	// Figurinha é conteúdo expressivo, não informativo: pular o modelo de visão — um webp por
	// reação seria custo puro. O texto fixo é o que agentes e prévias leem.
	if (mediaType === "FIGURINHA") {
		await db.update(chatMessages).set({ conteudoMidiaTextoProcessado: STICKER_PROCESSED_TEXT }).where(eq(chatMessages.id, messageId));
		return { status: "skipped" };
	}
	// Localização e contatos já entram como texto no persist; não há arquivo a processar.
	if (mediaType === "LOCALIZACAO") return { status: "skipped" };

	try {
		const { data: fileData, error: downloadError } = await supabaseClient.storage.from("files").download(storageId);
		if (downloadError || !fileData) throw new Error(`Erro ao baixar arquivo do storage: ${downloadError?.message ?? "sem dados"}`);
		const fileBuffer = Buffer.from(await fileData.arrayBuffer());

		let processedText = "";
		let summary = "";
		switch (mediaType) {
			case "AUDIO": {
				const result = await handleAIAudioProcessing(fileBuffer, mimeType);
				processedText = result.transcription;
				summary = result.summary;
				break;
			}
			case "IMAGEM": {
				const result = await handleAIImageProcessing(fileBuffer, mimeType);
				processedText = result.description;
				summary = result.summary;
				break;
			}
			case "VIDEO": {
				const result = await handleAIVideoProcessing(fileBuffer, mimeType);
				processedText = result.analysis;
				summary = result.summary;
				break;
			}
			case "DOCUMENTO": {
				const result = await handleAIDocumentProcessing(fileBuffer, mimeType);
				processedText = result.extraction;
				summary = result.summary;
				break;
			}
		}

		await db
			.update(chatMessages)
			.set({
				conteudoMidiaTextoProcessado: processedText,
				conteudoMidiaTextoProcessadoResumo: summary,
				metadados: await mergeMediaStatus(messageId, { processingStatus: "processed", failureReason: undefined }),
			})
			.where(eq(chatMessages.id, messageId));

		console.log(`${log} Mídia processada:`, messageId);
		return { status: "processed", processedText, summary };
	} catch (error) {
		const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
		console.error(`${log} Falha ao processar mídia da mensagem ${messageId}:`, error);

		try {
			await db
				.update(chatMessages)
				.set({ metadados: await mergeMediaStatus(messageId, { processingStatus: "failed", failureReason: reason.slice(0, FAILURE_REASON_MAX_LENGTH) }) })
				.where(eq(chatMessages.id, messageId));
		} catch (persistError) {
			console.error(`${log} Falha ao registrar o erro de mídia na mensagem ${messageId}:`, persistError);
		}

		if (isAiGatewayCreditError(error)) {
			await notifyAiGatewayCreditExhausted({ source: "MIDIA", organizacaoId, detail: reason });
		}
		return { status: "failed", error: reason };
	}
}

/** Preserva o que já existe em `metadados` (referral, reações…) e só toca o bloco da mídia. */
async function mergeMediaStatus(
	messageId: string,
	patch: Pick<NonNullable<TChatMessageMetadata["whatsappMidia"]>, "processingStatus" | "failureReason">,
): Promise<TChatMessageMetadata> {
	const current = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, messageId), columns: { metadados: true } });
	const metadados: TChatMessageMetadata = current?.metadados ?? {};
	return { ...metadados, whatsappMidia: { ...metadados.whatsappMidia, ...patch } };
}

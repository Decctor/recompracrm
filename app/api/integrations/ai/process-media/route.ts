import { appApiHandler } from "@/lib/app-api";
import { supabaseClient } from "@/services/supabase";
import { gateway, generateText, transcribe } from "ai";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const ProcessMediaInputSchema = z.object({
	messageId: z.string(),
	storageId: z.string(),
	mimeType: z.string(),
	mediaType: z.enum(["IMAGEM", "VIDEO", "AUDIO", "DOCUMENTO"]),
});

export type ProcessMediaInput = z.infer<typeof ProcessMediaInputSchema>;

const ProcessMediaOutputSchema = z.union([
	z.object({
		success: z.literal(true),
		processedText: z.string(),
		summary: z.string(),
	}),
	z.object({
		success: z.literal(false),
		error: z.string(),
	}),
]);

async function processMediaRoute(req: NextRequest) {
	try {
		const payload = await req.json();
		console.log("[INFO] [PROCESS_MEDIA] Request received:", payload);

		const validationResult = ProcessMediaInputSchema.safeParse(payload);
		if (!validationResult.success) {
			return NextResponse.json({
				success: false,
				error: `Dados inválidos: ${validationResult.error.errors.map((e) => e.message).join(", ")}`,
			}, { status: 400 });
		}

		const { messageId, storageId, mimeType, mediaType } = validationResult.data;

		// Download file from Supabase Storage
		const { data: fileData, error: downloadError } = await supabaseClient.storage.from("files").download(storageId);

		if (downloadError || !fileData) {
			console.error("[PROCESS_MEDIA] Download error:", downloadError);
			return NextResponse.json({
				success: false,
				error: "Erro ao baixar arquivo do storage",
			}, { status: 500 });
		}

		const fileBuffer = Buffer.from(await fileData.arrayBuffer());
		let processedText = "";
		let summary = "";

		switch (mediaType) {
			case "AUDIO": {
				const result = await processAudio(fileBuffer, mimeType);
				processedText = result.transcription;
				summary = result.summary;
				break;
			}
			case "IMAGEM": {
				const result = await processImage(fileBuffer, mimeType);
				processedText = result.description;
				summary = result.summary;
				break;
			}
			case "VIDEO": {
				const result = await processVideo(fileBuffer, mimeType);
				processedText = result.analysis;
				summary = result.summary;
				break;
			}
			case "DOCUMENTO": {
				const result = await processDocument(fileBuffer, mimeType);
				processedText = result.extraction;
				summary = result.summary;
				break;
			}
		}

		console.log("[PROCESS_MEDIA] Completed for message:", messageId);

		return NextResponse.json({
			success: true,
			processedText,
			summary,
		}, { status: 200 });
	} catch (error) {
		console.error("[PROCESS_MEDIA] Error:", error);
		return NextResponse.json({
			success: false,
			error: error instanceof Error ? error.message : "Erro desconhecido",
		}, { status: 500 });
	}
}

async function processAudio(fileBuffer: Buffer, _mimeType: string): Promise<{ transcription: string; summary: string }> {
	console.log("[AI_MEDIA] Processing audio file");

	try {
		const transcriptionResponse = await transcribe({
			model: gateway.transcription("openai/whisper-1"),
			audio: fileBuffer,
		});

		const transcription = transcriptionResponse.text;

		const summaryResult = await generateText({
			model: gateway("openai/gpt-4o-mini"),
			prompt: `Resuma o seguinte áudio transcrito em português de forma concisa (máximo 3 linhas):\n\n${transcription}`,
		});

		return {
			transcription,
			summary: summaryResult.text,
		};
	} catch (error) {
		console.error("[AI_MEDIA] Error processing audio:", error);
		throw error;
	}
}

async function processImage(fileBuffer: Buffer, mimeType: string): Promise<{ description: string; summary: string }> {
	console.log("[AI_MEDIA] Processing image file");

	try {
		const base64Image = fileBuffer.toString("base64");
		const dataUrl = `data:${mimeType};base64,${base64Image}`;

		const descriptionResult = await generateText({
			// Descrição de foto é o passo caro do pipeline: o gpt-4o cobrava ~US$0,005 por imagem.
			// O Gemini 2.5 Flash-Lite custa ~25x menos, é servido pelo Google/Vertex, não raciocina
			// por padrão e lê bem português e texto em imagem (recibos, prints, etiquetas).
			model: gateway("google/gemini-2.5-flash-lite"),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text:
								"Descreva esta imagem em português de forma detalhada, incluindo todos os elementos visuais relevantes, texto visível (se houver), e contexto geral.",
						},
						{
							type: "image",
							image: dataUrl,
						},
					],
				},
			],
		});

		const summaryResult = await generateText({
			model: gateway("openai/gpt-4o-mini"),
			prompt: `Resuma a seguinte descrição de imagem em português de forma concisa (máximo 2 linhas):\n\n${descriptionResult.text}`,
		});

		return {
			description: descriptionResult.text,
			summary: summaryResult.text,
		};
	} catch (error) {
		console.error("[AI_MEDIA] Error processing image:", error);
		throw error;
	}
}

async function processVideo(fileBuffer: Buffer, mimeType: string): Promise<{ analysis: string; summary: string }> {
	console.log("[AI_MEDIA] Processing video file");

	// Note: Video processing is complex. For a complete solution, you'd need:
	// 1. Extract audio track and transcribe it
	// 2. Extract key frames
	// 3. Analyze frames with Vision API
	// This is a simplified implementation
	const analysis = `Vídeo recebido (${mimeType}). Processamento completo de vídeo requer extração de frames e áudio. Considere implementar com ffmpeg para análise completa.`;
	const summary = "Vídeo recebido - processamento básico";

	return { analysis, summary };
}

async function processDocument(fileBuffer: Buffer, mimeType: string): Promise<{ extraction: string; summary: string }> {
	console.log("[AI_MEDIA] Processing document file");

	try {
		let textContent = "";

		if (mimeType === "application/pdf") {
			textContent = `Documento PDF recebido. Para extração completa de texto, considere adicionar a biblioteca 'pdf-parse'.`;
		} else if (mimeType.includes("text/") || mimeType.includes("application/json")) {
			textContent = fileBuffer.toString("utf-8");
		} else {
			textContent = `Documento recebido (${mimeType})`;
		}

		const extractionResult = await generateText({
			model: gateway("openai/gpt-4o-mini"),
			prompt: `Analise o seguinte documento e extraia as informações-chave mais importantes em português:\n\n${textContent}`,
		});

		const summaryResult = await generateText({
			model: gateway("openai/gpt-4o-mini"),
			prompt: `Resuma o seguinte documento em português de forma concisa (máximo 3 linhas):\n\n${extractionResult.text}`,
		});

		return {
			extraction: extractionResult.text,
			summary: summaryResult.text,
		};
	} catch (error) {
		console.error("[AI_MEDIA] Error processing document:", error);
		throw error;
	}
}

export type TProcessMediaOutput = z.infer<typeof ProcessMediaOutputSchema>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = appApiHandler({
	POST: processMediaRoute,
});

import { gateway, generateText, transcribe } from "ai";

export async function handleAIAudioProcessing(fileBuffer: Buffer, mimeType: string): Promise<{ transcription: string; summary: string }> {
	console.log("[AI_MEDIA] Processing audio file");

	try {
		const transcriptionResponse = await transcribe({
			// AI SDK 7: transcricao passa pelo AI Gateway como qualquer outro modelo (sem chave da OpenAI).
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

export async function handleAIImageProcessing(fileBuffer: Buffer, mimeType: string): Promise<{ description: string; summary: string }> {
	console.log("[AI_MEDIA] Processing image file");

	try {
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
						// AI SDK 7 depreciou a parte "image"; a parte "file" recebe os bytes e o SDK
						// codifica em base64 e confirma o tipo real da imagem pelos magic bytes.
						{
							type: "file",
							data: fileBuffer,
							mediaType: mimeType,
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

export async function handleAIVideoProcessing(fileBuffer: Buffer, mimeType: string): Promise<{ analysis: string; summary: string }> {
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

export async function handleAIDocumentProcessing(fileBuffer: Buffer, mimeType: string): Promise<{ extraction: string; summary: string }> {
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

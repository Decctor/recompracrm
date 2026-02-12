import { getAgentResponse } from "@/lib/ai-agent";
import { db } from "@/services/drizzle";
import { chatMessages, chatServices, chats } from "@/services/drizzle/schema/chats";
import { desc, eq, or } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";
import z from "zod";

const GenerateAIResponseInputSchema = z.object({
	chatId: z.string({
		required_error: "O ID do chat é obrigatório",
		invalid_type_error: "O ID do chat deve ser uma string",
	}),
});

export type GenerateAIResponseInput = z.infer<typeof GenerateAIResponseInputSchema>;

const GenerateAIResponseOutputSchema = z.union([
	z.object({
		success: z.literal(true),
		message: z.string(),
		metadata: z
			.object({
				toolsUsed: z.array(z.string()),
				serviceDescription: z.string(),
				escalation: z.object({
					applicable: z.boolean(),
					reason: z.string().optional(),
				}),
				tokensUsed: z.number(),
			})
			.optional(),
	}),
	z.object({
		success: z.literal(false),
		error: z.string(),
		details: z.array(z.string()),
	}),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	try {
		console.log("[INFO] [GENERATE_AI_RESPONSE] Request received with body:", req.body);

		const validationResult = GenerateAIResponseInputSchema.safeParse(req.body);
		if (!validationResult.success) {
			return res.status(400).json({
				success: false,
				error: "Dados inválidos",
				details: validationResult.error.errors.map((e) => e.message),
			});
		}

		const { chatId } = validationResult.data;

		// Get chat with client info
		const chat = await db.query.chats.findFirst({
			where: (fields, { eq }) => eq(fields.id, chatId),
			with: {
				cliente: true,
			},
		});

		if (!chat) {
			return res.status(404).json({
				success: false,
				error: "Chat não encontrado",
				details: ["O chat especificado não existe"],
			});
		}

		// Get last 100 messages
		const messages = await db.query.chatMessages.findMany({
			where: (fields, { eq }) => eq(fields.chatId, chatId),
			orderBy: (fields, { desc }) => [desc(fields.dataEnvio)],
			limit: 100,
		});

		// Get open service
		const openService = await db.query.chatServices.findFirst({
			where: (fields, { and, eq, or }) => and(eq(fields.chatId, chatId), or(eq(fields.status, "PENDENTE"), eq(fields.status, "EM_ANDAMENTO"))),
		});

		// Format chat summary for AI agent
		const chatSummary = {
			id: chat.id,
			ultimaMensagemData: chat.ultimaMensagemData,
			cliente: {
				idApp: chat.cliente?.id || "",
				nome: chat.cliente?.nome || "",
				telefone: chat.cliente?.telefone || "",
				telefoneBase: chat.cliente?.telefoneBase || "",
				email: chat.cliente?.email,
				localizacaoCep: chat.cliente?.localizacaoCep,
				localizacaoEstado: chat.cliente?.localizacaoEstado,
				localizacaoCidade: chat.cliente?.localizacaoCidade,
				localizacaoBairro: chat.cliente?.localizacaoBairro,
				localizacaoLogradouro: chat.cliente?.localizacaoLogradouro,
				localizacaoNumero: chat.cliente?.localizacaoNumero,
				localizacaoComplemento: chat.cliente?.localizacaoComplemento,
			},
			ultimasMensagens: messages.map((m) => ({
				id: m.id,
				autorTipo: m.autorTipo.toLowerCase(),
				conteudoTipo: m.conteudoMidiaTipo,
				conteudoTexto: m.conteudoTexto || `[${m.conteudoMidiaTipo}]: ${m.conteudoMidiaTextoProcessadoResumo || ""}`,
				conteudoMidiaUrl: m.conteudoMidiaUrl,
				dataEnvio: m.dataEnvio.getTime(),
				atendimentoId: m.servicoId,
			})),
			atendimentoAberto: openService
				? {
						id: openService.id,
						descricao: openService.descricao,
						status: openService.status,
					}
				: null,
		};

		console.log("[INFO] [GENERATE_AI_RESPONSE] Calling AI Agent with:", {
			chatId: chatSummary.id,
			clientId: chatSummary.cliente.idApp,
			messageCount: chatSummary.ultimasMensagens.length,
		});

		// Generate AI response
		const aiResponse = await getAgentResponse({
			details: chatSummary,
		});

		console.log("[API] [GERAR_RESPOSTA] AI Response metadata:", {
			toolsUsed: aiResponse.metadata.toolsUsed,
			serviceDescription: aiResponse.metadata.serviceDescription,
			tokensUsed: aiResponse.metadata.tokensUsed,
		});

		const validatedResponse = GenerateAIResponseOutputSchema.parse({
			success: true,
			message: aiResponse.message,
			metadata: {
				...aiResponse.metadata,
				escalation: { applicable: false },
			},
		});

		return res.status(200).json(validatedResponse);
	} catch (error) {
		console.error("[API] [GERAR_RESPOSTA] Error:", error);
		const validatedResponse = GenerateAIResponseOutputSchema.parse({
			success: false,
			error: error instanceof Error ? error.message : "Erro desconhecido",
			details: [error instanceof Error ? error.message : "Erro desconhecido"],
		});
		return res.status(500).json(validatedResponse);
	}
}

export type TGenerateAIResponseOutput = z.infer<typeof GenerateAIResponseOutputSchema>;

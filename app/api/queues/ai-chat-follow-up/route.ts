import { runAiFollowUp } from "@/lib/chats/ai-follow-up-runner";
import { handleCallback } from "@vercel/queue";
import { z } from "zod";

/**
 * Consumer do tópico `ai-chat-follow-ups` (produtor em `lib/chats/ai-follow-up-queue.ts`).
 *
 * Sem URL pública: triggers `queue/v2beta` só são invocáveis pela infraestrutura da Vercel.
 * O runner reconfere status, posse, silêncio do cliente e janela contra o banco antes de
 * qualquer envio — uma reentrega recua sozinha.
 */
const AiFollowUpQueueMessageSchema = z.object({
	followUpId: z.string({ invalid_type_error: "Tipo inválido para o id da retomada." }),
	organizationId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }),
	chatId: z.string({ invalid_type_error: "Tipo inválido para o id do chat." }),
	tentativa: z.number({ invalid_type_error: "Tipo inválido para a tentativa." }),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (message) => {
		await runAiFollowUp(AiFollowUpQueueMessageSchema.parse(message));
	},
	{
		retry: (error, metadata) => {
			if (metadata.deliveryCount >= 3) {
				console.error("[AI_FOLLOW_UP] [QUEUE] Mensagem descartada após 3 tentativas:", metadata.messageId, error);
				return { acknowledge: true };
			}
			return { afterSeconds: 60 };
		},
	},
);

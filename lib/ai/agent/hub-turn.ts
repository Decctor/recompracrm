import { confirmAiResponseStillValid, confirmClientInAgentScope, findLatestClientMessage } from "@/lib/chats/ai-trigger";
import { db } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { resolveChatDeliverer } from "./delivery";
import { ensureOrganizationAgent } from "./provisioning";
import { respondToChatWithAgent } from "./respond-to-chat";

/**
 * Executa um turno do agente logo depois de um humano entregar a conversa a ele pelo hub.
 *
 * Sem isto, a atribuição só surtiria efeito na próxima mensagem do cliente — e o momento em que
 * alguém entrega uma conversa à IA é justamente quando o cliente está esperando resposta.
 *
 * Diferenças em relação ao gatilho por webhook:
 *
 * - **Sem debounce.** O disparo é uma decisão humana, não uma rajada de mensagens a agrupar.
 *   As reconfirmações (`confirmAiResponseStillValid`) continuam valendo integralmente.
 * - **Só com pendência do cliente.** Se a última palavra da conversa já é nossa, não há o que
 *   responder: a IA entra no próximo turno, pelo webhook. Responder aqui seria a IA puxando
 *   assunto sozinha.
 *
 * Nunca lança: é chamada dentro de `waitUntil`, fora do ciclo do request. A atribuição já está
 * gravada e uma falha de execução não deve desfazê-la — a falha do turno fica registrada em
 * `ai_agent_runs`, como no caminho do webhook.
 */
export async function triggerAgentTurnFromHub({
	organizacaoId,
	chatId,
	agenteId,
}: {
	organizacaoId: string;
	chatId: string;
	agenteId: string;
}): Promise<void> {
	try {
		// Mesmo gate do webhook: entregar a conversa ao agente pelo hub não pode furar o escopo.
		// A UI desabilita a ação, mas a regra tem de valer aqui — a UI é conveniência, não guarda.
		const agent = await ensureOrganizationAgent(db, organizacaoId);
		const scope = await confirmClientInAgentScope({ organizationId: organizacaoId, chatId, agentId: agent.id, escopo: agent.escopo });
		if (!scope.shouldRespond) {
			console.log("[AI_AGENT] [HUB_TURN] Fora do escopo do agente:", scope.reason);
			return;
		}

		const chat = await db.query.chats.findFirst({
			where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
			columns: { ultimaMensagemEntradaData: true, ultimaMensagemSaidaData: true },
		});
		if (!chat?.ultimaMensagemEntradaData) return;

		const pendente = !chat.ultimaMensagemSaidaData || chat.ultimaMensagemEntradaData > chat.ultimaMensagemSaidaData;
		if (!pendente) return;

		const ultimaDoCliente = await findLatestClientMessage({ chatId });
		if (!ultimaDoCliente) return;

		const confirmation = await confirmAiResponseStillValid({ organizationId: organizacaoId, chatId, messageId: ultimaDoCliente.id });
		if (!confirmation.shouldRespond) {
			console.log("[AI_AGENT] [HUB_TURN] Resposta abortada:", confirmation.reason);
			return;
		}

		const deliver = await resolveChatDeliverer({ organizacaoId, chatId });
		if (!deliver) {
			console.warn("[AI_AGENT] [HUB_TURN] Sem canal de entrega para o chat:", chatId);
			return;
		}

		const result = await respondToChatWithAgent({
			organizacaoId,
			chatId,
			gatilho: "ATRIBUICAO_HUB",
			mensagemGatilhoId: ultimaDoCliente.id,
			deliver,
		});
		console.log("[AI_AGENT] [HUB_TURN] Execução concluída:", result.runId, "agente:", agenteId);
	} catch (error) {
		console.error("[ERROR] [AI_AGENT] [HUB_TURN] Falha na execução do agente após atribuição:", error);
	}
}

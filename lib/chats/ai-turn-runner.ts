import { resolveChatDeliverer } from "@/lib/ai/agent/delivery";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { respondToChatWithAgent } from "@/lib/ai/agent/respond-to-chat";
import { runTriageGate } from "@/lib/ai/triage/triage-gate";
import { claimChatForAi, confirmAiResponseStillValid, confirmClientInAgentScope } from "@/lib/chats/ai-trigger";
import { db } from "@/services/drizzle";

/**
 * Turno de IA disparado por uma mensagem do cliente, independente do transporte que o
 * invocou — inline no webhook (sob waitUntil) ou consumer de Vercel Queues.
 *
 * Idempotente e seguro sob reentrega: claim por CAS, confirmação pré-run e revalidação
 * pré-entrega são checados aqui dentro, contra o banco. Um retry de um turno velho vê os
 * fatos atualizados e recua sozinho.
 *
 * Pressupõe o debounce já cumprido (sleep no transporte inline, delaySeconds na fila).
 */
export type TAiTurnPayload = {
	organizationId: string;
	chatId: string;
	triggerMessageId: string;
	// ISO string: o payload atravessa JSON (fila) sem perder tipo.
	triggerMessageSentAt: string;
};

export async function runAiTurnForMessage(payload: TAiTurnPayload): Promise<void> {
	const agent = await ensureOrganizationAgent(db, payload.organizationId);
	if (agent.status !== "ATIVO") {
		console.log("[AI_TURN] Agente de IA pausado para a organização:", payload.organizationId);
		return;
	}

	// Antes do claim, de propósito: o claim aceita de imediato a conversa que já é do agente,
	// então uma checagem depois dele não valeria para quem entrou na lista de exclusão no meio
	// do atendimento. Aqui a regra vale por turno.
	const scope = await confirmClientInAgentScope({
		organizationId: payload.organizationId,
		chatId: payload.chatId,
		agentId: agent.id,
		escopo: agent.escopo,
	});
	if (!scope.shouldRespond) {
		console.log("[AI_TURN] Fora do escopo do agente:", scope.reason);
		return;
	}

	// Claim depois do debounce: mais perto da entrega, menor a janela para responder por
	// cima de um humano que assumiu durante a espera.
	const claim = await claimChatForAi({ organizationId: payload.organizationId, chatId: payload.chatId, agentId: agent.id });
	if (!claim.shouldRespond) {
		console.log("[AI_TURN] IA não assumiu o atendimento:", claim.reason);
		return;
	}

	const confirmation = await confirmAiResponseStillValid({
		organizationId: payload.organizationId,
		chatId: payload.chatId,
		messageId: payload.triggerMessageId,
		messageDate: new Date(payload.triggerMessageSentAt),
	});
	if (!confirmation.shouldRespond) {
		console.log("[AI_TURN] Resposta da IA abortada:", confirmation.reason);
		return;
	}

	// Sem canal de entrega não há turno: gastar tokens numa resposta que não sai é pior
	// do que não responder.
	const deliver = await resolveChatDeliverer({ organizacaoId: payload.organizationId, chatId: payload.chatId });
	if (!deliver) {
		console.warn("[AI_TURN] Sem canal de entrega para o chat:", payload.chatId);
		return;
	}

	// Triagem: depois de tudo que é grátis (claim, confirmação, canal) e antes do que custa.
	const gate = await runTriageGate(db, {
		organizacaoId: payload.organizationId,
		chatId: payload.chatId,
		agent,
		triggerMessageId: payload.triggerMessageId,
		deliver,
	});
	if (gate.acao === "PULAR" || gate.acao === "HANDOFF") {
		console.log(`[AI_TURN] Triagem decidiu ${gate.acao} (run ${gate.runId}).`);
		return;
	}

	try {
		const result = await respondToChatWithAgent({
			organizacaoId: payload.organizationId,
			chatId: payload.chatId,
			gatilho: "CHAT_MENSAGEM",
			mensagemGatilhoId: payload.triggerMessageId,
			deliver,
			modeloOverride: gate.acao === "MODELO_ECONOMICO" ? gate.modelo : null,
			triagem: gate.triagem,
		});
		console.log("[AI_TURN] Execução do agente concluída:", result.runId);
	} catch (error) {
		// A execução falha fica registrada em `ai_agent_runs` com o erro; nada é enviado ao
		// cliente — mensagem genérica de desculpas só esconderia o problema.
		console.error("[AI_TURN] Falha na execução do agente de IA:", error);
	}
}

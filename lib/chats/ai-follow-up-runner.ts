import { resolveChatDeliverer } from "@/lib/ai/agent/delivery";
import { cancelFollowUpById, markFollowUpExecuted, markFollowUpExpired } from "@/lib/ai/agent/follow-ups";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { respondToChatWithAgent } from "@/lib/ai/agent/respond-to-chat";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { confirmClientInAgentScope } from "@/lib/chats/ai-trigger";
import { getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import { AI_AGENT_FOLLOW_UP_CANCEL_REASONS, AiAgentCapabilitiesSchema } from "@/schemas/ai-agents";
import { db } from "@/services/drizzle";
import { aiAgentFollowUps, aiAgentRuns, chatMessages, chats } from "@/services/drizzle/schema";
import { and, eq, gt } from "drizzle-orm";

/**
 * Executa uma retomada reivindicada pelo cron (ou entregue pela fila).
 *
 * Reconfere **tudo** contra o banco antes de gastar tokens: a retomada ainda está AGENDADA, o
 * agente está ativo com retomadas habilitadas, o cliente segue no escopo, o atendimento é o
 * mesmo episódio e continua com o agente, o cliente não falou desde o agendamento, a comunicação
 * não foi pausada e a janela de 24h está aberta. Os cancelamentos em linha (`attendance-state`,
 * webhook) são para a UI refletir na hora; a correção vive aqui.
 *
 * O turno de retomada pode devolver `mensagem: null` — o agente releu a conversa e decidiu que
 * retomar não faz sentido. Isso conta como EXECUTADA sem envio: a decisão foi tomada.
 */
export type TAiFollowUpPayload = {
	followUpId: string;
	organizationId: string;
	chatId: string;
	tentativa: number;
};

const LOG = "[AI_FOLLOW_UP]";

export async function runAiFollowUp(payload: TAiFollowUpPayload): Promise<void> {
	const { followUpId, organizationId, chatId } = payload;
	const now = new Date();

	const followUp = await db.query.aiAgentFollowUps.findFirst({
		where: and(eq(aiAgentFollowUps.id, followUpId), eq(aiAgentFollowUps.organizacaoId, organizationId)),
	});
	if (!followUp || followUp.status !== "AGENDADA") {
		console.log(`${LOG} Retomada não está mais agendada:`, followUpId, followUp?.status);
		return;
	}

	const cancel = async (motivo: string) => {
		await cancelFollowUpById(db, { id: followUpId, organizacaoId: organizationId, motivo });
		console.log(`${LOG} Retomada cancelada:`, followUpId, motivo);
	};

	const agent = await ensureOrganizationAgent(db, organizationId);
	if (agent.status !== "ATIVO") return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.DESABILITADAS);
	const capacidades = parseJsonbWithFallback(AiAgentCapabilitiesSchema, agent.capacidades);
	if (!capacidades.retomadas.habilitadas) return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.DESABILITADAS);

	const scope = await confirmClientInAgentScope({ organizationId, chatId, agentId: agent.id, escopo: agent.escopo });
	if (!scope.shouldRespond) return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.FORA_DO_ESCOPO);

	const atendimento = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });
	if (!atendimento || atendimento.id !== followUp.atendimentoId) return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.ATENDIMENTO_ENCERRADO);
	if (atendimento.responsavelTipo !== "AGENTE") return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU);

	const clienteFalou = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.chatId, chatId), eq(chatMessages.autorTipo, "CLIENTE"), gt(chatMessages.dataEnvio, followUp.dataInsercao)),
		columns: { id: true },
	});
	if (clienteFalou) return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.CLIENTE_RESPONDEU);

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizationId)),
		columns: { whatsappJanelaDataExpiracao: true, ultimaMensagemEntradaData: true },
		with: { whatsappConexao: { columns: { tipoConexao: true } }, cliente: { columns: { comunicacaoPausadaAte: true } } },
	});
	if (!chat) return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.ATENDIMENTO_ENCERRADO);
	if (chat.cliente?.comunicacaoPausadaAte && chat.cliente.comunicacaoPausadaAte > now) {
		return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.COMUNICACAO_PAUSADA);
	}
	if (!isWhatsappWindowOpen({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.whatsappConexao?.tipoConexao, now })) {
		await markFollowUpExpired(db, { id: followUpId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.JANELA_FECHADA });
		console.log(`${LOG} Retomada expirada pela janela de 24h:`, followUpId);
		return;
	}

	const deliver = await resolveChatDeliverer({ organizacaoId: organizationId, chatId });
	if (!deliver) {
		console.warn(`${LOG} Sem canal de entrega para o chat:`, chatId);
		return;
	}

	const horasSilencio = chat.ultimaMensagemEntradaData
		? Math.max(1, Math.round((now.getTime() - chat.ultimaMensagemEntradaData.getTime()) / 3_600_000))
		: null;

	const result = await respondToChatWithAgent({
		organizacaoId: organizationId,
		chatId,
		gatilho: "RETOMADA",
		mensagemGatilhoId: null,
		deliver,
		retomada: { id: followUpId, objetivo: followUp.objetivo, horasSilencio },
	});

	// A run pode ter sido cancelada pela revalidação (cliente falou durante a geração, humano
	// assumiu): a conversa mudou, a retomada não vale mais.
	const run = await db.query.aiAgentRuns.findFirst({ where: eq(aiAgentRuns.id, result.runId), columns: { status: true } });
	if (run?.status === "CANCELADO") return cancel(AI_AGENT_FOLLOW_UP_CANCEL_REASONS.CONVERSA_MUDOU);

	await markFollowUpExecuted(db, { id: followUpId, runId: result.runId, now });
	console.log(`${LOG} Retomada executada:`, followUpId, result.messageId ? "com envio" : "sem envio (agente decidiu não retomar)");
}

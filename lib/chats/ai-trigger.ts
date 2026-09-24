import { claimChatAttendanceForAgent, getCurrentChatAttendance, releaseChatAttendance } from "@/lib/chats/attendance-state";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { AiAgentScopeSchema, isClientInAgentScope } from "@/schemas/ai-agents";
import type { TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatMessages, chats } from "@/services/drizzle/schema";
import { and, desc, eq, gt, inArray } from "drizzle-orm";

/**
 * Decide se a IA deve responder a uma mensagem recebida.
 *
 * Duas mudanças sobre o modelo antigo:
 *
 * 1. **A IA reivindica o atendimento em vez de ser dona por padrão.** Antes, o serviço
 *    nascia com `responsavelTipo: "AI"` sempre que o número permitia, e o humano tinha
 *    que tomar a conversa dela. Agora o ticket nasce sem dono e a IA só entra se o
 *    compare-and-set de `claimChatAttendanceForAgent` casar — se um humano assumiu
 *    primeiro, a IA nem chega a gerar resposta.
 *
 * 2. **O debounce sai da coluna `ai_agendamento_resposta_data`.** O modelo antigo gravava
 *    um timestamp no chat e comparava na volta do sleep; isso perdia corridas (dois
 *    webhooks quase simultâneos escreviam timestamps diferentes e os dois seguiam) e
 *    acoplava um detalhe de execução ao schema. Agora a checagem é sobre os fatos: a
 *    mensagem que disparou ainda é a última do cliente, e ninguém respondeu depois dela.
 */

const AI_RESPONSE_DELAY_MS = 5000;

export type TAiTriggerDecision = { shouldRespond: true } | { shouldRespond: false; reason: string };

const OUT_OF_SCOPE_RELEASE_REASON = "CLIENTE_FORA_DO_ESCOPO";

/**
 * Decide se o cliente da conversa está no escopo de atendimento do agente.
 *
 * **Roda antes de `claimChatForAi`, nunca dentro dele.** O claim faz curto-circuito quando o
 * atendimento já é do agente (`responsavelTipo === "AGENTE"`), então uma checagem lá dentro não
 * valeria para uma conversa que o agente já conduz — e adicionar alguém à lista de exclusão no
 * meio do atendimento não teria efeito nenhum. Aqui a regra vale por turno, retroativamente.
 *
 * Quando o cliente sai do escopo e o atendimento é do próprio agente, o atendimento é
 * **liberado**: sem isso o ticket continuaria marcado como `AGENTE` e a conversa pareceria
 * atendida enquanto ninguém a atende. Liberar devolve a conversa para a fila do hub.
 *
 * Deliberadamente fora de `respondToChatWithAgent`: aquele é o caminho de execução compartilhado
 * com o playground, que precisa continuar funcionando justamente enquanto o agente roda numa
 * lista de permissão.
 */
export async function confirmClientInAgentScope({
	organizationId,
	chatId,
	agentId,
	escopo,
}: {
	organizationId: string;
	chatId: string;
	agentId: string;
	// Cru do jsonb: normalizado aqui, para o caller não precisar saber disso.
	escopo: unknown;
}): Promise<TAiTriggerDecision> {
	const scope = parseJsonbWithFallback(AiAgentScopeSchema, escopo);
	// O default é TODOS, então o caso comum não custa nem a leitura do chat.
	if (scope.tipo === "TODOS") return { shouldRespond: true };

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizationId)),
		columns: { clienteId: true },
	});
	if (!chat) return { shouldRespond: false, reason: "Chat não encontrado." };
	if (isClientInAgentScope(scope, chat.clienteId)) return { shouldRespond: true };

	const atual = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });
	if (atual?.responsavelTipo === "AGENTE" && atual.responsavelAgenteId === agentId) {
		await releaseChatAttendance(db, { organizacaoId: organizationId, chatId, motivo: OUT_OF_SCOPE_RELEASE_REASON });
	}

	return { shouldRespond: false, reason: "Cliente fora do escopo de atendimento do agente." };
}

/**
 * Reivindica o atendimento para a IA.
 *
 * Devolve `false` quando a conversa já tem dono — humano do hub, telefone ou outro
 * episódio da própria IA que ainda não encerrou.
 */
export async function claimChatForAi({
	organizationId,
	chatId,
	agentId,
}: {
	organizationId: string;
	chatId: string;
	agentId: string;
}): Promise<TAiTriggerDecision> {
	const atual = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });

	if (atual?.responsavelTipo === "USUARIO") return { shouldRespond: false, reason: "Atendimento com responsável humano." };
	if (atual?.responsavelTipo === "EXTERNO") return { shouldRespond: false, reason: "Atendimento em andamento pelo telefone." };
	// Já é da IA: o episódio segue, não precisa reivindicar de novo.
	if (atual?.responsavelTipo === "AGENTE") return { shouldRespond: true };

	const claimed = await claimChatAttendanceForAgent(db, { organizacaoId: organizationId, chatId, agenteId: agentId });
	if (!claimed) return { shouldRespond: false, reason: "Atendimento assumido por outra parte durante o claim." };

	return { shouldRespond: true };
}

/**
 * O atendimento ainda autoriza a IA a falar.
 *
 * Um handoff feito pela própria run conta como posse: o atendimento passou a ser do humano, mas
 * a mensagem desta run é justamente o aviso ao cliente (e muitas vezes a resposta ao que ele
 * pediu). Sem essa exceção, o agente que transferia descartava a própria resposta e o cliente
 * ficava sem retorno até o atendente aparecer.
 */
async function isAttendanceStillAgentOwned({
	organizationId,
	chatId,
	ownHandoffAttendanceId,
}: {
	organizationId: string;
	chatId: string;
	ownHandoffAttendanceId: string | null;
}): Promise<boolean> {
	const atual = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });
	if (atual?.responsavelTipo === "AGENTE") return true;
	return Boolean(ownHandoffAttendanceId && atual?.id === ownHandoffAttendanceId);
}

/**
 * Reconfirma que responder ainda faz sentido, sobre os fatos da conversa.
 *
 * Aborta se o cliente mandou outra mensagem depois da que disparou (a mais nova dispara o
 * próprio ciclo, e responder à antiga produziria duas respostas), se alguém já respondeu, ou
 * se o atendimento deixou de ser da IA.
 *
 * Separado do debounce de propósito: o gatilho por webhook precisa esperar antes de conferir,
 * mas o gatilho do hub (um humano entregando a conversa ao agente) não tem rajada de mensagens
 * para agrupar — precisa das mesmas verificações, sem a espera.
 */
export async function confirmAiResponseStillValid({
	organizationId,
	chatId,
	messageId,
	messageDate,
	ownHandoffAttendanceId = null,
}: {
	organizationId: string;
	chatId: string;
	messageId: string;
	messageDate: Date;
	ownHandoffAttendanceId?: string | null;
}): Promise<TAiTriggerDecision> {
	const ultimaDoCliente = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.chatId, chatId), eq(chatMessages.autorTipo, "CLIENTE")),
		orderBy: [desc(chatMessages.dataEnvio), desc(chatMessages.id)],
		columns: { id: true },
	});
	if (ultimaDoCliente?.id !== messageId) return { shouldRespond: false, reason: "Chegou mensagem mais recente do cliente." };

	const respostaPosterior = await db.query.chatMessages.findFirst({
		where: and(
			eq(chatMessages.chatId, chatId),
			inArray(chatMessages.autorTipo, ["USUÁRIO", "AI", "BUSINESS-APP"]),
			gt(chatMessages.dataEnvio, messageDate),
		),
		columns: { id: true },
	});
	if (respostaPosterior) return { shouldRespond: false, reason: "A conversa já foi respondida." };

	// Reconfirma a posse antes de gastar tokens: o humano pode ter assumido no intervalo.
	if (!(await isAttendanceStillAgentOwned({ organizationId, chatId, ownHandoffAttendanceId }))) {
		return { shouldRespond: false, reason: "O atendimento deixou de ser da IA." };
	}

	return { shouldRespond: true };
}

/**
 * Última checagem antes de entregar a mensagem produzida por uma run.
 *
 * A run de LLM leva dezenas de segundos e não pode ser cancelada em andamento; este é o único
 * ponto de corte depois que ela termina. Reusa as consultas do confirm pré-run — a janela
 * perigosa cai da duração da run para os milissegundos entre esta checagem e o envio.
 *
 * A semântica varia por gatilho: CHAT_MENSAGEM ancora na mensagem que disparou o ciclo;
 * ATRIBUICAO_HUB não tem mensagem gatilho e ancora no início da run; PLAYGROUND é síncrono
 * e sem concorrência — sempre entrega.
 */
export async function confirmAiDeliveryStillValid({
	organizationId,
	chatId,
	trigger,
	triggerMessageId,
	runStartedAt,
	ownHandoffAttendanceId = null,
}: {
	organizationId: string;
	chatId: string;
	trigger: TAiAgentRunTriggerEnum;
	triggerMessageId: string | null;
	runStartedAt: Date;
	/** Atendimento que esta run transferiu para um humano, se transferiu. */
	ownHandoffAttendanceId?: string | null;
}): Promise<TAiTriggerDecision> {
	if (trigger === "PLAYGROUND") return { shouldRespond: true };

	if (trigger === "CHAT_MENSAGEM" && triggerMessageId) {
		const triggerMessage = await db.query.chatMessages.findFirst({
			where: and(eq(chatMessages.id, triggerMessageId), eq(chatMessages.organizacaoId, organizationId)),
			columns: { id: true, dataEnvio: true },
		});
		if (!triggerMessage) return { shouldRespond: false, reason: "Mensagem gatilho não encontrada." };
		return confirmAiResponseStillValid({
			organizationId,
			chatId,
			messageId: triggerMessage.id,
			messageDate: triggerMessage.dataEnvio,
			ownHandoffAttendanceId,
		});
	}

	const entradaPosterior = await db.query.chatMessages.findFirst({
		where: and(eq(chatMessages.chatId, chatId), eq(chatMessages.autorTipo, "CLIENTE"), gt(chatMessages.dataEnvio, runStartedAt)),
		columns: { id: true },
	});
	if (entradaPosterior) return { shouldRespond: false, reason: "Chegou mensagem do cliente durante a run." };

	const respostaPosterior = await db.query.chatMessages.findFirst({
		where: and(
			eq(chatMessages.chatId, chatId),
			inArray(chatMessages.autorTipo, ["USUÁRIO", "AI", "BUSINESS-APP"]),
			gt(chatMessages.dataEnvio, runStartedAt),
		),
		columns: { id: true },
	});
	if (respostaPosterior) return { shouldRespond: false, reason: "A conversa já foi respondida durante a run." };

	if (!(await isAttendanceStillAgentOwned({ organizationId, chatId, ownHandoffAttendanceId }))) {
		return { shouldRespond: false, reason: "O atendimento deixou de ser da IA." };
	}

	return { shouldRespond: true };
}

export { AI_RESPONSE_DELAY_MS, OUT_OF_SCOPE_RELEASE_REASON };

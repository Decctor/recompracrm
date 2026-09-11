import { confirmAiDeliveryStillValid } from "@/lib/chats/ai-trigger";
import { updateChatAttendanceSummary } from "@/lib/chats/attendance-state";
import type { TAiAgentTurnAttachment } from "@/schemas/ai-agents";
import type { TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import type { DB, DBTransaction } from "@/services/drizzle";
import { linkAgentRunMessage, markAgentRunCancelled } from "./runs";
import { executeAgentTurn, prepareAgentExecution } from "./runtime";

type TDb = DB | DBTransaction;

/**
 * Como a mensagem produzida chega ao cliente. Cada canal fornece a sua:
 * - Meta Cloud API: checa a janela de 24h, envia e persiste;
 * - gateway interno: enfileira no gateway e persiste como PENDENTE;
 * - playground: apenas persiste, sem envio externo.
 */
export type TAgentMessageDeliverer = (args: {
	mensagem: string;
	/** Já normalizado pelo runtime; o adapter degrada para texto se o provedor recusar. */
	anexo: TAiAgentTurnAttachment | null;
	runId: string;
	agenteId: string;
}) => Promise<{ messageId: string | null }>;

export type TRespondToChatResult = {
	runId: string;
	mensagem: string | null;
	anexo: TAiAgentTurnAttachment | null;
	messageId: string | null;
	resumoAtendimento: string;
};

/**
 * Entry-point do agente sobre um chat.
 *
 * O envio da mensagem **não** é uma ferramenta: a resposta é a saída estruturada do turno e a
 * entrega acontece aqui, por um adapter do canal. Isso garante no máximo uma mensagem por
 * execução por construção — em vez de depender de o modelo obedecer à instrução — e mantém as
 * regras de canal (janela de 24h, fila do gateway) fora do alcance do LLM.
 */
export async function respondToChatWithAgent({
	organizacaoId,
	chatId,
	gatilho,
	mensagemGatilhoId,
	deliver,
	database = db,
}: {
	organizacaoId: string;
	chatId: string;
	gatilho: TAiAgentRunTriggerEnum;
	mensagemGatilhoId?: string | null;
	deliver: TAgentMessageDeliverer;
	database?: TDb;
}): Promise<TRespondToChatResult> {
	// Antes do prepare: uma mensagem que chegue durante a montagem do contexto pode ficar de
	// fora dele — a âncora precisa cobrir essa janela também.
	const runStartedAt = new Date();
	const prepared = await prepareAgentExecution({ organizacaoId, chatId, gatilho, mensagemGatilhoId, database });
	const output = await executeAgentTurn(prepared);

	let messageId: string | null = null;
	// Um anexo sozinho é entrega legítima: o arquivo pode ser a resposta inteira.
	if (output.mensagem?.trim() || output.anexo) {
		// A run não é cancelável em andamento; este é o ponto de corte. Se o cliente mandou
		// outra mensagem durante o turno, a run dela responde — entregar esta produziria uma
		// resposta gerada sem a última mensagem no contexto, e duas respostas no total.
		const delivery = await confirmAiDeliveryStillValid({
			organizationId: organizacaoId,
			chatId,
			trigger: gatilho,
			triggerMessageId: mensagemGatilhoId ?? null,
			runStartedAt,
		});
		if (!delivery.shouldRespond) {
			await markAgentRunCancelled(database, { runId: prepared.run.id, reason: delivery.reason });
			console.log("[AI_AGENT] Entrega cancelada:", delivery.reason);
			// O resumo também não grava: veio de um contexto que a conversa já superou.
			return { runId: prepared.run.id, mensagem: null, anexo: null, messageId: null, resumoAtendimento: "" };
		}

		const delivered = await deliver({
			mensagem: output.mensagem?.trim() ?? "",
			anexo: output.anexo,
			runId: prepared.run.id,
			agenteId: prepared.toolContext.agent.id,
		});
		messageId = delivered.messageId;
		if (messageId) await linkAgentRunMessage(database, { runId: prepared.run.id, mensagemId: messageId });
	}

	// O resumo é acessório: já respondemos ao cliente, e uma falha aqui não deve derrubar o turno.
	if (output.resumoAtendimento?.trim()) {
		try {
			await updateChatAttendanceSummary(database, { organizacaoId, chatId, resumo: output.resumoAtendimento.trim() });
		} catch (error) {
			console.error("[ERROR] [AI_AGENT] Falha ao atualizar o resumo do atendimento:", error);
		}
	}

	return { runId: prepared.run.id, mensagem: output.mensagem, anexo: output.anexo, messageId, resumoAtendimento: output.resumoAtendimento };
}

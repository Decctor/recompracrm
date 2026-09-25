import { confirmAiDeliveryStillValid, type TAiTriggerDecision } from "@/lib/chats/ai-trigger";
import { updateChatAttendanceSummary } from "@/lib/chats/attendance-state";
import type { TAiAgentTurnAttachment } from "@/schemas/ai-agents";
import type { TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import type { DB, DBTransaction } from "@/services/drizzle";
import { isAgentError } from "../shared/errors";
import { scheduleFollowUpFromTurn } from "./follow-ups";
import { linkAgentRunMessage, markAgentRunCancelled } from "./runs";
import { executeAgentTurn, prepareAgentExecution } from "./runtime";

type TDb = DB | DBTransaction;

/** Intervalo entre checagens de que a run ainda faz sentido. Três consultas leves por tique. */
const STALE_RUN_CHECK_INTERVAL_MS = 3000;

/**
 * Observa a conversa enquanto o modelo gera e aborta a run assim que ela fica velha — o cliente
 * mandou outra mensagem, um humano respondeu, o atendimento mudou de mão. Antes disso a run só
 * era descartada depois de pronta, com todo o custo já gasto.
 *
 * Um tique nunca sobrepõe o anterior: se o banco demorar, o próximo espera.
 */
function watchForStaleRun({ check, onStale }: { check: () => Promise<TAiTriggerDecision>; onStale: (reason: string) => void }): () => void {
	let stopped = false;
	let inFlight = false;
	const timer = setInterval(async () => {
		if (stopped || inFlight) return;
		inFlight = true;
		try {
			const decision = await check();
			if (!decision.shouldRespond && !stopped) onStale(decision.reason);
		} catch (error) {
			console.error("[AI_AGENT] Falha na checagem de run obsoleta:", error);
		} finally {
			inFlight = false;
		}
	}, STALE_RUN_CHECK_INTERVAL_MS);

	return () => {
		stopped = true;
		clearInterval(timer);
	};
}

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
	/** Preenchido quando a mensagem é uma retomada programada: a bolha do hub a rotula. */
	retomadaId?: string | null;
}) => Promise<{ messageId: string | null }>;

/** Turno de retomada: o que o agente pediu ao agendar, para o prompt do turno. */
export type TRespondToChatFollowUp = { id: string; objetivo: string; horasSilencio: number | null };

export type TRespondToChatResult = {
	runId: string;
	mensagem: string | null;
	anexo: TAiAgentTurnAttachment | null;
	messageId: string | null;
	resumoAtendimento: string;
	/** Retomada agendada por este turno, quando o agente pediu e as guardas deixaram. */
	retomadaAgendada: { id: string; para: Date } | null;
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
	retomada = null,
	database = db,
}: {
	organizacaoId: string;
	chatId: string;
	gatilho: TAiAgentRunTriggerEnum;
	mensagemGatilhoId?: string | null;
	deliver: TAgentMessageDeliverer;
	retomada?: TRespondToChatFollowUp | null;
	database?: TDb;
}): Promise<TRespondToChatResult> {
	// Antes do prepare: uma mensagem que chegue durante a montagem do contexto pode ficar de
	// fora dele — a âncora precisa cobrir essa janela também.
	const runStartedAt = new Date();
	const prepared = await prepareAgentExecution({ organizacaoId, chatId, gatilho, mensagemGatilhoId, retomada, database });

	// A mesma revalidação da entrega, só que durante a geração. O playground é síncrono e sem
	// concorrência: não há o que observar.
	const abortController = new AbortController();
	const checkStillValid = () =>
		confirmAiDeliveryStillValid({
			organizationId: organizacaoId,
			chatId,
			trigger: gatilho,
			triggerMessageId: mensagemGatilhoId ?? null,
			runStartedAt,
			ownHandoffAttendanceId: prepared.toolContext.effects.handoffAttendanceId,
		});
	const stopWatching =
		gatilho === "PLAYGROUND" ? () => {} : watchForStaleRun({ check: checkStillValid, onStale: (reason) => abortController.abort(reason) });

	let output: Awaited<ReturnType<typeof executeAgentTurn>>;
	try {
		output = await executeAgentTurn(prepared, { abortSignal: abortController.signal });
	} catch (error) {
		if (isAgentError(error, "AgentRunAbortedError")) {
			console.log("[AI_AGENT] Run abortada durante a geração:", (error as Error).message);
			return { runId: prepared.run.id, mensagem: null, anexo: null, messageId: null, resumoAtendimento: "", retomadaAgendada: null };
		}
		throw error;
	} finally {
		stopWatching();
	}

	let messageId: string | null = null;
	// Um anexo sozinho é entrega legítima: o arquivo pode ser a resposta inteira.
	if (output.mensagem?.trim() || output.anexo) {
		// A run não é cancelável em andamento; este é o ponto de corte. Se o cliente mandou
		// outra mensagem durante o turno, a run dela responde — entregar esta produziria uma
		// resposta gerada sem a última mensagem no contexto, e duas respostas no total.
		const delivery = await checkStillValid();
		if (!delivery.shouldRespond) {
			await markAgentRunCancelled(database, { runId: prepared.run.id, reason: delivery.reason });
			console.log("[AI_AGENT] Entrega cancelada:", delivery.reason);
			// O resumo também não grava: veio de um contexto que a conversa já superou.
			return { runId: prepared.run.id, mensagem: null, anexo: null, messageId: null, resumoAtendimento: "", retomadaAgendada: null };
		}

		const delivered = await deliver({
			mensagem: output.mensagem?.trim() ?? "",
			anexo: output.anexo,
			runId: prepared.run.id,
			agenteId: prepared.toolContext.agent.id,
			retomadaId: retomada?.id ?? null,
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

	// Retomada: decidida pelo agente na saída do turno (zero chamadas extras); aqui só as guardas.
	// Acessória como o resumo, e só em turnos que respondem ao cliente — uma retomada nunca
	// agenda outra retomada, e o playground não tem cliente para esperar.
	let retomadaAgendada: TRespondToChatResult["retomadaAgendada"] = null;
	if (output.retomada && messageId && (gatilho === "CHAT_MENSAGEM" || gatilho === "ATRIBUICAO_HUB")) {
		try {
			const scheduled = await scheduleFollowUpFromTurn(database, {
				organizacaoId,
				chatId,
				agenteId: prepared.toolContext.agent.id,
				runId: prepared.run.id,
				retomada: output.retomada,
				capacidades: prepared.toolContext.capacidades,
			});
			if (scheduled.agendada) retomadaAgendada = { id: scheduled.id, para: scheduled.para };
			else console.log("[AI_AGENT] Retomada não agendada:", scheduled.motivo);
		} catch (error) {
			console.error("[ERROR] [AI_AGENT] Falha ao agendar a retomada:", error);
		}
	}

	return {
		runId: prepared.run.id,
		mensagem: output.mensagem,
		anexo: output.anexo,
		messageId,
		resumoAtendimento: output.resumoAtendimento,
		retomadaAgendada,
	};
}

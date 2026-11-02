import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { claimChatAttendanceForAgent, getCurrentChatAttendance, releaseChatAttendance } from "@/lib/chats/attendance-state";
import { isOrganizationStaffPhone, resolveClientPhoneBase } from "@/lib/chats/staff-phone";
import { AiAgentCapabilitiesSchema, AiAgentScopeSchema, isClientExplicitlyIncludedInAgentScope, isClientInAgentScope } from "@/schemas/ai-agents";
import type { TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { aiAgentRuns, chatMessages, chats } from "@/services/drizzle/schema";
import { type SQL, and, asc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import {
	AI_SKIP_REASONS,
	type TAiTriggerDecision,
	type TChatReplyCandidate,
	computeAiResponseDelayMs,
	decideAiResponseValidity,
} from "./ai-response-validity";

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

export type { TAiTriggerDecision };

/**
 * Quando a mensagem chegou ao nosso banco. Linhas anteriores à migration 0144 não têm
 * `data_insercao`; para elas o `data_envio` é a melhor aproximação que existe.
 */
function chatMessageInsertedAt(table: { dataInsercao: AnyPgColumn; dataEnvio: AnyPgColumn } = chatMessages) {
	// `mapWith` pela coluna: o driver devolve `timestamp` como texto sem fuso, e o decoder dela é
	// o que o converte em Date do jeito certo (UTC).
	return sql`coalesce(${table.dataInsercao}, ${table.dataEnvio})`.mapWith(table.dataEnvio) as SQL<Date>;
}

/**
 * Data comparada contra `chatMessageInsertedAt`: do lado esquerdo há uma expressão, não uma coluna,
 * então o drizzle não aplica o encoder do `timestamp`. Serializa igual a ele (ISO em UTC).
 */
function asTimestamp(date: Date) {
	return sql`${date.toISOString()}::timestamp`;
}

/** Respostas de saída podem chegar em rajada (IA + humano); 50 cobre com folga qualquer janela de turno. */
const REPLY_CANDIDATES_LIMIT = 50;

/**
 * Resultado do claim. `fresh` diz se este turno foi quem tirou o atendimento da fila: só então o
 * runner pode devolvê-lo à fila se o turno morrer antes de gerar qualquer coisa. Um episódio que o
 * agente já conduzia (`fresh: false`) tem história — liberar ali apagaria a posse legítima.
 */
export type TAiClaimDecision = { shouldRespond: true; fresh: boolean } | { shouldRespond: false; reason: string };

const OUT_OF_SCOPE_RELEASE_REASON = "CLIENTE_FORA_DO_ESCOPO";
const STAFF_PHONE_RELEASE_REASON = "NUMERO_DA_EQUIPE";

/**
 * Quanto esperar antes de a IA responder a uma mensagem.
 *
 * No modo RESERVA a espera é o tempo dado à equipe: se alguém responder (hub ou celular da loja)
 * nesse intervalo, as reconfirmações do runner veem a resposta e a IA recua sozinha — não há
 * lógica nova, só uma espera maior antes das mesmas checagens. Com o transporte inline a espera
 * consome duração da função do webhook; para esperas de minutos, use `AI_TURN_TRANSPORT=queue`.
 *
 * Uma mensagem que é só saudação espera mais (`GREETING_RESPONSE_DELAY_MS`): a pergunta costuma
 * vir logo atrás, e assim um turno só responde às duas.
 */
export function resolveAiResponseDelayMs(capacidades: unknown, { conteudoTexto = null }: { conteudoTexto?: string | null } = {}): number {
	const parsed = parseJsonbWithFallback(AiAgentCapabilitiesSchema, capacidades);
	return computeAiResponseDelayMs({
		atrasoRespostaMs: parsed.atendimento.atrasoRespostaMs ?? AI_RESPONSE_DELAY_MS,
		modo: parsed.atendimento.modo,
		esperaHumanoMs: parsed.atendimento.esperaHumanoMs,
		conteudoTexto,
	});
}

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

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizationId)),
		columns: { clienteId: true },
		with: { cliente: { columns: { telefone: true, telefoneBase: true } } },
	});
	if (!chat) return { shouldRespond: false, reason: "Chat não encontrado." };

	const releaseIfOwnedByAgent = async (motivo: string) => {
		const atual = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });
		if (atual?.responsavelTipo === "AGENTE" && atual.responsavelAgenteId === agentId) {
			await releaseChatAttendance(db, { organizacaoId: organizationId, chatId, motivo });
		}
	};

	// Lista explícita de inclusão vence a regra da equipe: é assim que a loja testa o agente no
	// próprio número antes de liberá-lo para todo mundo. O gate do hub
	// (`resolveAiAssignmentAvailability`) aplica a mesma exceção.
	if (!isClientExplicitlyIncludedInAgentScope(scope, chat.clienteId)) {
		const telefoneBase = resolveClientPhoneBase(chat.cliente);
		if (await isOrganizationStaffPhone(db, { organizationId, telefoneBase })) {
			await releaseIfOwnedByAgent(STAFF_PHONE_RELEASE_REASON);
			return { shouldRespond: false, reason: "Número de alguém da equipe da organização." };
		}
	}

	if (scope.tipo === "TODOS" || isClientInAgentScope(scope, chat.clienteId)) return { shouldRespond: true };

	await releaseIfOwnedByAgent(OUT_OF_SCOPE_RELEASE_REASON);
	return { shouldRespond: false, reason: "Cliente fora do escopo de atendimento do agente." };
}

/**
 * Reivindica o atendimento para a IA.
 *
 * Recusa (`shouldRespond: false`) quando a conversa tem dono humano ou o telefone, ou quando o
 * CAS perde para outra parte. Um episódio da própria IA ainda aberto segue com `fresh: false`.
 */
export async function claimChatForAi({
	organizationId,
	chatId,
	agentId,
}: {
	organizationId: string;
	chatId: string;
	agentId: string;
}): Promise<TAiClaimDecision> {
	const atual = await getCurrentChatAttendance(db, { organizacaoId: organizationId, chatId });

	if (atual?.responsavelTipo === "USUARIO") return { shouldRespond: false, reason: "Atendimento com responsável humano." };
	if (atual?.responsavelTipo === "EXTERNO") return { shouldRespond: false, reason: "Atendimento em andamento pelo telefone." };
	// Já é da IA: o episódio segue, não precisa reivindicar de novo.
	if (atual?.responsavelTipo === "AGENTE") return { shouldRespond: true, fresh: false };

	const claimed = await claimChatAttendanceForAgent(db, { organizacaoId: organizationId, chatId, agenteId: agentId });
	if (!claimed) return { shouldRespond: false, reason: "Atendimento assumido por outra parte durante o claim." };

	return { shouldRespond: true, fresh: true };
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
 * Lê os fatos sobre a mensagem gatilho e decide (`decideAiResponseValidity`) se ela ainda espera
 * resposta: não chegou outra mensagem do cliente depois dela e nada gravado depois a respondeu.
 *
 * Tudo por `inseridaEm` (nosso relógio), nunca por `dataEnvio`, e uma resposta da IA só conta se
 * a run que a produziu viu esta mensagem — ver lib/chats/ai-response-validity.ts.
 */
async function evaluateTriggerMessage({
	organizationId,
	chatId,
	messageId,
}: {
	organizationId: string;
	chatId: string;
	messageId: string;
}): Promise<TAiTriggerDecision> {
	const insertedAt = chatMessageInsertedAt();
	const [trigger] = await db
		.select({ id: chatMessages.id, inseridaEm: insertedAt })
		.from(chatMessages)
		.where(and(eq(chatMessages.id, messageId), eq(chatMessages.chatId, chatId), eq(chatMessages.organizacaoId, organizationId)))
		.limit(1);
	if (!trigger) return decideAiResponseValidity({ trigger: null, newerClientMessageId: null, replies: [] });

	const runTriggerMessages = alias(chatMessages, "run_trigger_messages");
	const [newerClientMessages, replyRows] = await Promise.all([
		db
			.select({ id: chatMessages.id })
			.from(chatMessages)
			.where(
				and(
					eq(chatMessages.chatId, chatId),
					eq(chatMessages.autorTipo, "CLIENTE"),
					ne(chatMessages.id, trigger.id),
					gte(insertedAt, asTimestamp(trigger.inseridaEm)),
				),
			)
			.limit(1),
		db
			.select({
				id: chatMessages.id,
				autorTipo: chatMessages.autorTipo,
				inseridaEm: insertedAt,
				runId: aiAgentRuns.id,
				runMensagemGatilhoId: aiAgentRuns.mensagemGatilhoId,
				runInseridaEm: aiAgentRuns.dataInsercao,
				runMensagemGatilhoInseridaEm: chatMessageInsertedAt(runTriggerMessages),
			})
			.from(chatMessages)
			// Vínculo mensagem → run pelo espelho em `metadados`: o canônico (`mensagemEnviadaId`) só é
			// gravado depois da entrega, e a janela entre os dois é exatamente onde a corrida acontece.
			.leftJoin(aiAgentRuns, sql`${chatMessages.autorTipo} = 'AI' and ${aiAgentRuns.id} = ${chatMessages.metadados}->'aiAgente'->>'runId'`)
			.leftJoin(runTriggerMessages, eq(runTriggerMessages.id, aiAgentRuns.mensagemGatilhoId))
			.where(
				and(
					eq(chatMessages.chatId, chatId),
					inArray(chatMessages.autorTipo, ["USUÁRIO", "AI", "BUSINESS-APP"]),
					gt(insertedAt, asTimestamp(trigger.inseridaEm)),
					// Envio que falhou não respondeu ninguém: sem este filtro a FALHA da própria IA
					// bloqueava toda nova tentativa ("já foi respondida") e o cliente ficava sem retorno.
					ne(chatMessages.statusEntrega, "FALHA"),
				),
			)
			.orderBy(asc(insertedAt))
			.limit(REPLY_CANDIDATES_LIMIT),
	]);

	const replies: TChatReplyCandidate[] = replyRows.map((row) => ({
		id: row.id,
		autorTipo: row.autorTipo as TChatReplyCandidate["autorTipo"],
		inseridaEm: row.inseridaEm,
		run:
			row.runId && row.runInseridaEm
				? {
						mensagemGatilhoId: row.runMensagemGatilhoId,
						mensagemGatilhoInseridaEm: row.runMensagemGatilhoInseridaEm ?? null,
						inseridaEm: row.runInseridaEm,
					}
				: null,
	}));

	return decideAiResponseValidity({ trigger, newerClientMessageId: newerClientMessages[0]?.id ?? null, replies });
}

/**
 * Reconfirma que responder ainda faz sentido, sobre os fatos da conversa.
 *
 * Aborta se o cliente mandou outra mensagem depois da que disparou (a mais nova dispara o
 * próprio ciclo, e responder à antiga produziria duas respostas), se alguém já respondeu a ela,
 * ou se o atendimento deixou de ser da IA.
 *
 * "Já respondeu" é estrito: uma resposta da IA produzida por uma run disparada por mensagem mais
 * antiga **não** conta — ela foi gerada sem esta mensagem no contexto. É o caso da saudação seguida
 * da pergunta: a resposta ao "Boa noite" não responde à pergunta que chegou logo depois.
 *
 * Separado do debounce de propósito: o gatilho por webhook precisa esperar antes de conferir,
 * mas o gatilho do hub (um humano entregando a conversa ao agente) não tem rajada de mensagens
 * para agrupar — precisa das mesmas verificações, sem a espera.
 */
export async function confirmAiResponseStillValid({
	organizationId,
	chatId,
	messageId,
	ownHandoffAttendanceId = null,
}: {
	organizationId: string;
	chatId: string;
	messageId: string;
	ownHandoffAttendanceId?: string | null;
}): Promise<TAiTriggerDecision> {
	const decision = await evaluateTriggerMessage({ organizationId, chatId, messageId });
	if (!decision.shouldRespond) return decision;

	// Reconfirma a posse antes de gastar tokens: o humano pode ter assumido no intervalo.
	if (!(await isAttendanceStillAgentOwned({ organizationId, chatId, ownHandoffAttendanceId }))) {
		return { shouldRespond: false, reason: AI_SKIP_REASONS.ATTENDANCE_LOST };
	}

	return { shouldRespond: true };
}

/**
 * Última checagem antes de entregar a mensagem produzida por uma run.
 *
 * A run de LLM leva dezenas de segundos; o vigia de `respondToChatWithAgent` a aborta no meio
 * quando a conversa a supera, e este é o corte final depois que ela termina. Reusa as consultas
 * do confirm pré-run — a janela perigosa cai da duração da run para os milissegundos entre esta
 * checagem e o envio.
 *
 * Para CHAT_MENSAGEM isso cobre a saudação seguida de pergunta: se a pergunta chegou durante a
 * run da saudação, "mensagem mais recente do cliente" cancela a entrega e o turno da pergunta
 * responde com as duas no contexto. Se a pergunta chegou depois da entrega, o turno dela não é
 * mais bloqueado pela resposta à saudação (ver `confirmAiResponseStillValid`).
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
		return confirmAiResponseStillValid({ organizationId, chatId, messageId: triggerMessageId, ownHandoffAttendanceId });
	}

	// `runStartedAt` é do nosso relógio: compara com `inseridaEm`, nunca com o timestamp do WhatsApp
	// (uma mensagem enviada antes do início da run mas recebida depois ficaria de fora do contexto).
	const insertedAt = chatMessageInsertedAt();
	const [[entradaPosterior], [respostaPosterior]] = await Promise.all([
		db
			.select({ id: chatMessages.id })
			.from(chatMessages)
			.where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.autorTipo, "CLIENTE"), gt(insertedAt, asTimestamp(runStartedAt))))
			.limit(1),
		db
			.select({ id: chatMessages.id })
			.from(chatMessages)
			.where(
				and(
					eq(chatMessages.chatId, chatId),
					inArray(chatMessages.autorTipo, ["USUÁRIO", "AI", "BUSINESS-APP"]),
					gt(insertedAt, asTimestamp(runStartedAt)),
					// Mesmo critério do confirm pré-run: uma tentativa que falhou não é resposta.
					ne(chatMessages.statusEntrega, "FALHA"),
				),
			)
			.limit(1),
	]);
	if (entradaPosterior) return { shouldRespond: false, reason: "Chegou mensagem do cliente durante a run." };

	if (respostaPosterior) return { shouldRespond: false, reason: "A conversa já foi respondida durante a run." };

	if (!(await isAttendanceStillAgentOwned({ organizationId, chatId, ownHandoffAttendanceId }))) {
		return { shouldRespond: false, reason: AI_SKIP_REASONS.ATTENDANCE_LOST };
	}

	return { shouldRespond: true };
}

/** A mensagem mais recente do cliente, pela ordem em que chegou até nós. */
export async function findLatestClientMessage({ chatId }: { chatId: string }) {
	const insertedAt = chatMessageInsertedAt();
	const [row] = await db
		.select({ id: chatMessages.id })
		.from(chatMessages)
		.where(and(eq(chatMessages.chatId, chatId), eq(chatMessages.autorTipo, "CLIENTE")))
		.orderBy(sql`${insertedAt} desc`, sql`${chatMessages.id} desc`)
		.limit(1);
	return row ?? null;
}

export { AI_RESPONSE_DELAY_MS, OUT_OF_SCOPE_RELEASE_REASON };

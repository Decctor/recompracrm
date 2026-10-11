import type { TChatAssignmentPriority, TChatAssignmentStatus } from "@/schemas/enums";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgentFollowUps, chatAssignments, chats } from "@/services/drizzle/schema";
import { AI_AGENT_FOLLOW_UP_CANCEL_REASONS } from "@/schemas/ai-agents";
import { cancelScheduledFollowUp, cancelScheduledFollowUpsForChats } from "@/lib/ai/agent/follow-up-cancel";
import { and, eq, inArray, lt, notExists, notInArray, sql } from "drizzle-orm";

/**
 * Camada canônica do estado de atendimento de um chat.
 *
 * **Toda** mutação de `chat_assignments` — rotas do hub, webhooks de WhatsApp e IA —
 * passa por aqui. Não existe `db.update(chatAssignments)` fora deste arquivo: é o que
 * mantém a semântica de posse, as métricas de resposta e as garantias de concorrência
 * em um lugar só.
 *
 * A garantia de base é o índice único parcial `idx_chat_assignments_one_current_per_chat`
 * (um atendimento ativo por chat). Ele é o que torna seguros o `onConflictDoNothing()` de
 * `ensureCurrentAttendance` e os compare-and-set de `assumeChatAttendanceForUser` e
 * `claimChatAttendanceForAgent`.
 */

type TAttendanceDb = DB | DBTransaction;

/** Origem de uma resposta ao cliente. Usada para telemetria e para diferenciar handoffs. */
export type TAttendanceResponseSource = "HUB" | "AI" | "WHATSAPP_ECHO" | "INTERNAL_GATEWAY";

const CLOSED_ATTENDANCE_STATUSES: TChatAssignmentStatus[] = ["ENCERRADO", "CANCELADO"];

/**
 * Motivo gravado quando um atendente assume uma conversa que era de um colega. Constante de
 * dados (aparece em `transferencia_motivo`), por isso em português e em SCREAMING_CASE.
 */
export const ATTENDANCE_TAKEOVER_REASON = "ASSUMIDO_PELO_ATENDENTE";

export function isClosedAttendanceStatus(status: string | null | undefined): status is "ENCERRADO" | "CANCELADO" {
	return CLOSED_ATTENDANCE_STATUSES.includes(status as TChatAssignmentStatus);
}

/**
 * Um chat tem pendência quando a última entrada do cliente é mais recente que a
 * última saída. É o que decide entre `ABERTO` e `EM_ATENDIMENTO` nas transições.
 */
async function getChatPendingState(db: TAttendanceDb, input: { chatId: string; organizacaoId: string }) {
	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, input.organizacaoId)),
		columns: { id: true, ultimaMensagemEntradaData: true, ultimaMensagemSaidaData: true },
	});
	if (!chat) return null;

	return {
		...chat,
		needsResponse: !!chat.ultimaMensagemEntradaData && (!chat.ultimaMensagemSaidaData || chat.ultimaMensagemEntradaData > chat.ultimaMensagemSaidaData),
	};
}

export async function getCurrentChatAttendance(db: TAttendanceDb, input: { organizacaoId: string; chatId: string }) {
	return db.query.chatAssignments.findFirst({
		where: and(
			eq(chatAssignments.chatId, input.chatId),
			eq(chatAssignments.organizacaoId, input.organizacaoId),
			notInArray(chatAssignments.status, CLOSED_ATTENDANCE_STATUSES),
		),
		with: {
			responsavelUsuario: { columns: { id: true, nome: true, avatarUrl: true } },
		},
		orderBy: (fields, { desc }) => [desc(fields.dataAtribuicao)],
	});
}

export type TCurrentChatAttendance = Awaited<ReturnType<typeof getCurrentChatAttendance>>;

async function ensureCurrentAttendance(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; now: Date; status?: TChatAssignmentStatus },
) {
	const current = await getCurrentChatAttendance(db, input);
	if (current) return current;

	// O ticket nasce sem dono ("NAO_ATRIBUIDO"): representa o chat na fila do hub, não um
	// humano responsável. A posse só é afirmada por assumir/claim/transferir, que sempre
	// setam o id correspondente.
	const [created] = await db
		.insert(chatAssignments)
		.values({
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			responsavelTipo: "NAO_ATRIBUIDO",
			status: input.status ?? "ABERTO",
			dataAtribuicao: input.now,
		})
		// Webhooks concorrentes disputam este find-then-insert; o índice único parcial
		// faz o segundo insert conflitar em vez de criar um segundo atendimento ativo.
		.onConflictDoNothing()
		.returning();
	if (created) return created;

	return getCurrentChatAttendance(db, input);
}

/** Mensagem recebida do cliente: reabre a pendência do atendimento. */
export async function markChatNeedsResponse(db: TAttendanceDb, input: { organizacaoId: string; chatId: string; messageDate: Date; now?: Date }) {
	const now = input.now ?? new Date();
	const current = await ensureCurrentAttendance(db, { ...input, now, status: "ABERTO" });
	if (!current) return null;

	// Uma nova entrada do cliente sempre reabre a pendência, inclusive sobre um ticket
	// já RESOLVIDO. (O módulo equivalente do Control tinha aqui um ternário cujos dois
	// ramos resolviam "ABERTO".)
	const [updated] = await db
		.update(chatAssignments)
		.set({ status: "ABERTO", dataUltimaEntradaCliente: input.messageDate })
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

/** Resposta enviada ao cliente, de qualquer origem: fecha a pendência e grava as métricas. */
export async function markChatAnswered(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; responseDate: Date; source: TAttendanceResponseSource; now?: Date },
) {
	const now = input.now ?? new Date();
	const current = await ensureCurrentAttendance(db, { ...input, now, status: "EM_ATENDIMENTO" });
	if (!current) return null;

	const [updated] = await db
		.update(chatAssignments)
		.set({
			status: current.status === "ABERTO" ? "EM_ATENDIMENTO" : current.status,
			dataPrimeiraResposta: current.dataPrimeiraResposta ?? input.responseDate,
			dataUltimaResposta: input.responseDate,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

/**
 * Marca o chat como atendido direto na plataforma externa — o operador respondeu pelo
 * app WhatsApp Business no celular (Coexistence).
 *
 * É o terceiro "jogador" da conversa, nem usuário do hub nem IA. Enquanto o atendimento
 * está `EXTERNO` a IA fica fora e o hub mostra "Atendido pelo telefone".
 *
 * Se um usuário do hub já é o dono, a resposta pelo celular **não** rouba a conversa dele.
 *
 * A assimetria é consciente: um ticket `AGENTE` **é** roubado, mesmo quando um humano entregou
 * a conversa à IA de propósito (`assignChatAttendanceToAgent`). O echo significa que alguém já
 * respondeu ao cliente pelo celular; preservar a atribuição para a IA continuar respondendo em
 * paralelo produziria duas respostas para a mesma mensagem, que é o pior defeito possível aqui.
 * Perder a decisão do humano é o preço, e ele é menor.
 */
export async function markChatAttendedExternally(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; responseDate: Date; now?: Date },
) {
	const now = input.now ?? new Date();
	const current = await getCurrentChatAttendance(db, input);

	// USUARIO sempre implica um responsavelUsuarioId real; tickets de fila são NAO_ATRIBUIDO.
	if (current && current.responsavelTipo === "USUARIO") {
		// O dono segue o mesmo, mas o cliente foi de fato respondido pelo celular: sem registrar a
		// resposta o ticket ficava em ABERTO e sem `dataPrimeiraResposta`, como se ninguém tivesse
		// falado — e o tempo de primeira resposta saía errado nas métricas.
		const answered = await markChatAnswered(db, {
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			responseDate: input.responseDate,
			source: "WHATSAPP_ECHO",
			now,
		});
		return answered ?? current;
	}

	const ensured = await ensureCurrentAttendance(db, { ...input, now, status: "EM_ATENDIMENTO" });
	if (!ensured) return null;

	// Alguém da equipe respondeu pelo celular: a IA sai, e um lembrete dela seria uma segunda voz.
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU });

	const [updated] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "EXTERNO",
			responsavelUsuarioId: null,
			responsavelAgenteId: null,
			status: "EM_ATENDIMENTO",
			dataPrimeiraResposta: ensured.dataPrimeiraResposta ?? input.responseDate,
			dataUltimaResposta: input.responseDate,
			dataLiberacao: null,
		})
		.where(eq(chatAssignments.id, ensured.id))
		.returning();

	return updated ?? null;
}

/**
 * Um usuário do hub assume o atendimento — inclusive o que está com um colega.
 *
 * Decisão de produto: quem tem `responder` pode tomar qualquer atendimento ativo. As pessoas
 * saem de turno, e o assumir é o caminho de autosserviço para repassar a conversa; exigir um
 * gestor para isso deixava o cliente esperando por alguém que já foi embora. Quando o dono é
 * outro usuário a troca é registrada como transferência (`transferidoParaUsuarioId` = quem
 * assumiu e `transferenciaMotivo` = `ATTENDANCE_TAKEOVER_REASON`), para a trilha não mentir.
 *
 * Compare-and-set sobre o dono **observado**: o UPDATE só casa se o ticket ainda tem o dono
 * (tipo + usuário) que acabamos de ler e segue ativo. Se outra pessoa assumiu entre o `ensure` e
 * o `update`, ou o ticket foi encerrado, zero linhas casam e a função devolve `null` — o
 * chamador deve responder 409 (corrida genuína), não sobrescrever às cegas. Assumir o que já é
 * seu continua idempotente.
 *
 * Para o gestor atribuindo a conversa a um terceiro existe `assignChatAttendance`, que
 * tem semântica de override consciente.
 */
export async function assumeChatAttendanceForUser(
	db: TAttendanceDb,
	input: {
		organizacaoId: string;
		chatId: string;
		usuarioId: string;
		/**
		 * Recusa (devolve `null`) quando o dono observado é outro usuário, em vez de tomar a conversa.
		 * Para chamadores que só podem assumir o que está livre — o encaminhamento, que já recusou a
		 * conversa de um colega na leitura e não pode tomá-la na janela entre a leitura e o CAS.
		 */
		somenteSeLivre?: boolean;
		now?: Date;
	},
) {
	const now = input.now ?? new Date();
	const ensured = await ensureCurrentAttendance(db, { ...input, now, status: "ABERTO" });
	if (!ensured) return null;

	const isTakeoverFromColleague =
		ensured.responsavelTipo === "USUARIO" && !!ensured.responsavelUsuarioId && ensured.responsavelUsuarioId !== input.usuarioId;
	if (isTakeoverFromColleague && input.somenteSeLivre) return null;

	const pending = await getChatPendingState(db, input);
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU });

	const [assumed] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "USUARIO",
			responsavelUsuarioId: input.usuarioId,
			responsavelAgenteId: null,
			atribuidoPorUsuarioId: input.usuarioId,
			...(isTakeoverFromColleague ? { transferidoParaUsuarioId: input.usuarioId, transferenciaMotivo: ATTENDANCE_TAKEOVER_REASON } : {}),
			dataAtribuicao: now,
			status: pending?.needsResponse ? "ABERTO" : "EM_ATENDIMENTO",
			dataLiberacao: null,
		})
		.where(
			and(
				eq(chatAssignments.id, ensured.id),
				eq(chatAssignments.organizacaoId, input.organizacaoId),
				notInArray(chatAssignments.status, CLOSED_ATTENDANCE_STATUSES),
				// Dono observado, não "sem dono": é o que deixa o take-over passar sem abrir mão da
				// detecção de corrida. `IS NOT DISTINCT FROM` porque o dono observado pode ser nulo.
				eq(chatAssignments.responsavelTipo, ensured.responsavelTipo),
				sql`${chatAssignments.responsavelUsuarioId} is not distinct from ${ensured.responsavelUsuarioId}`,
			),
		)
		.returning();

	return assumed ?? null;
}

/**
 * Atribuição com override: usada pela gestão para colocar um terceiro como responsável,
 * mesmo que a conversa já tenha dono. Sem CAS — a sobrescrita é o objetivo.
 */
export async function assignChatAttendance(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; usuarioId: string; atribuidoPorUsuarioId?: string | null; now?: Date },
) {
	const now = input.now ?? new Date();
	const pending = await getChatPendingState(db, input);
	const current = await ensureCurrentAttendance(db, {
		...input,
		now,
		status: pending?.needsResponse ? "ABERTO" : "EM_ATENDIMENTO",
	});
	if (!current) return null;

	// Toda troca de dono apaga a retomada da IA (assumir, transferir, liberar já o faziam); esta era
	// a única que deixava o lembrete agendado disparar por cima do novo responsável.
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU });

	const [updated] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "USUARIO",
			responsavelUsuarioId: input.usuarioId,
			responsavelAgenteId: null,
			atribuidoPorUsuarioId: input.atribuidoPorUsuarioId ?? current.atribuidoPorUsuarioId,
			dataAtribuicao: now,
			status: pending?.needsResponse ? "ABERTO" : current.status === "ABERTO" ? "EM_ATENDIMENTO" : current.status,
			dataLiberacao: null,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

/**
 * A IA reivindica um atendimento sem dono, a partir do webhook.
 *
 * Compare-and-set: o UPDATE só casa enquanto o ticket segue `NAO_ATRIBUIDO`. Se um humano
 * (ou o telefone) assumiu no intervalo, zero linhas casam e a função devolve `null` — a IA
 * deve recuar sem enviar nada. Este é o caminho pelo qual a IA **pega** um chat da fila; para
 * o humano que entrega a conversa a ela existe `assignChatAttendanceToAgent`.
 *
 * `atribuidoPorUsuarioId` é zerado de propósito: em um ticket `AGENTE` ele é o discriminador
 * entre "a IA pegou da fila" (nulo) e "um humano passou pra IA" (preenchido). Sem o reset, um
 * ticket que já passou por um humano manteria o campo e o sinal mentiria.
 */
export async function claimChatAttendanceForAgent(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; agenteId?: string | null; now?: Date },
) {
	const now = input.now ?? new Date();
	const pending = await getChatPendingState(db, input);

	const [claimed] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "AGENTE",
			responsavelUsuarioId: null,
			responsavelAgenteId: input.agenteId ?? null,
			atribuidoPorUsuarioId: null,
			dataAtribuicao: now,
			status: pending?.needsResponse ? "ABERTO" : "EM_ATENDIMENTO",
			dataLiberacao: null,
		})
		.where(
			and(
				eq(chatAssignments.organizacaoId, input.organizacaoId),
				eq(chatAssignments.chatId, input.chatId),
				eq(chatAssignments.responsavelTipo, "NAO_ATRIBUIDO"),
				notInArray(chatAssignments.status, CLOSED_ATTENDANCE_STATUSES),
			),
		)
		.returning();

	return claimed ?? null;
}

/**
 * Um humano do hub entrega o atendimento ao agente de IA.
 *
 * Contraparte de `claimChatAttendanceForAgent`, com três diferenças conscientes:
 *
 * 1. **Sem compare-and-set.** A sobrescrita é o objetivo — quem chama já provou posse ou
 *    gestão (`mayManageAssignment`), como em `assignChatAttendance`.
 * 2. **Não abre atendimento.** Usa `getCurrentChatAttendance` em vez de `ensureCurrentAttendance`:
 *    entregar ao agente é decidir sobre uma conversa em curso, não criar um ticket. Sem
 *    atendimento ativo a função devolve `null` e a rota responde 409.
 * 3. **Grava `atribuidoPorUsuarioId`.** É o que distingue este caminho do claim da fila.
 *
 * Quem barra os estados de origem inválidos (o telefone, em `EXTERNO`) é a rota: aqui a
 * conversa já está decidida.
 */
export async function assignChatAttendanceToAgent(
	db: TAttendanceDb,
	input: {
		organizacaoId: string;
		chatId: string;
		agenteId: string;
		atribuidoPorUsuarioId: string;
		motivo?: string | null;
		prioridade?: TChatAssignmentPriority | null;
		now?: Date;
	},
) {
	const now = input.now ?? new Date();
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;

	const pending = await getChatPendingState(db, input);

	// Um novo episódio do agente decide sozinho se quer retomar: o lembrete do episódio anterior
	// (que pode ter sido agendado por outro objetivo) não vale mais. `SUBSTITUIDA` e não
	// `HUMANO_ASSUMIU`: ninguém humano assumiu aqui, e ela não conta no limite de retomadas por atendimento.
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.SUBSTITUIDA });

	const [updated] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "AGENTE",
			responsavelUsuarioId: null,
			responsavelAgenteId: input.agenteId,
			atribuidoPorUsuarioId: input.atribuidoPorUsuarioId,
			// O alvo de transferência é sempre um usuário; deixá-lo preenchido faria o painel
			// exibir o humano da transferência anterior como responsável desta conversa.
			transferidoParaUsuarioId: null,
			transferenciaMotivo: input.motivo ?? null,
			// A prioridade é do atendimento, não de quem o conduz: sobrevive à troca de responsável.
			prioridade: input.prioridade ?? current.prioridade,
			dataAtribuicao: now,
			status: pending?.needsResponse ? "ABERTO" : current.status === "ABERTO" ? "EM_ATENDIMENTO" : current.status,
			dataLiberacao: null,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

export async function transferChatAttendance(
	db: TAttendanceDb,
	input: {
		organizacaoId: string;
		chatId: string;
		usuarioDestinoId: string;
		motivo?: string | null;
		prioridade?: TChatAssignmentPriority | null;
		transferidoPorUsuarioId?: string | null;
		/** Resultado do atendimento a gravar já na transferência (ex.: `HUMAN_HANDOFF` quando a IA desiste). */
		resultado?: string | null;
		now?: Date;
	},
) {
	const now = input.now ?? new Date();
	const current = await ensureCurrentAttendance(db, { ...input, now, status: "EM_ATENDIMENTO" });
	if (!current) return null;

	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU });

	const [updated] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "USUARIO",
			responsavelUsuarioId: input.usuarioDestinoId,
			responsavelAgenteId: null,
			atribuidoPorUsuarioId: input.transferidoPorUsuarioId ?? current.atribuidoPorUsuarioId,
			transferidoParaUsuarioId: input.usuarioDestinoId,
			transferenciaMotivo: input.motivo ?? null,
			// O ticket segue ativo com o humano, então o resultado só vira estatística quando ele
			// fechar: `closeChatAttendance` e o cron de inatividade preservam o que já está gravado.
			resultado: input.resultado ?? current.resultado,
			prioridade: input.prioridade ?? current.prioridade,
			dataAtribuicao: now,
			dataLiberacao: null,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

/** Devolve o atendimento para a fila do hub. Se há pendência do cliente, volta a `ABERTO`. */
export async function releaseChatAttendance(db: TAttendanceDb, input: { organizacaoId: string; chatId: string; motivo?: string | null; now?: Date }) {
	const now = input.now ?? new Date();
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;

	const pending = await getChatPendingState(db, input);
	// Sem dono não há quem retome: a próxima mensagem do cliente decide quem entra.
	await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.HUMANO_ASSUMIU });
	const [updated] = await db
		.update(chatAssignments)
		.set({
			responsavelTipo: "NAO_ATRIBUIDO",
			responsavelUsuarioId: null,
			responsavelAgenteId: null,
			// Volta para a fila sem rastro de quem atribuiu: se a IA reivindicar depois, o campo
			// preenchido faria o ticket parecer entregue por um humano (ver `claimChatAttendanceForAgent`).
			atribuidoPorUsuarioId: null,
			status: pending?.needsResponse ? "ABERTO" : current.status,
			dataLiberacao: now,
			transferenciaMotivo: input.motivo ?? null,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

export async function changeChatAttendanceStatus(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; status: TChatAssignmentStatus; usuarioId?: string | null; now?: Date },
) {
	const now = input.now ?? new Date();
	// Sem `ensure`: mudar o status de uma conversa sem atendimento ativo não é abrir um ticket. O
	// insert antigo espalhava `status` no ticket novo e nascia um atendimento já encerrado.
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;

	const isTerminal = input.status === "ENCERRADO" || input.status === "CANCELADO";
	// RESOLVIDO também encerra o assunto para a IA: um lembrete saindo depois de "resolvido" seria
	// ela reabrindo o que a equipe acabou de dar por concluído.
	if (isTerminal || input.status === "RESOLVIDO") {
		await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.ATENDIMENTO_ENCERRADO });
	}
	const [updated] = await db
		.update(chatAssignments)
		.set({
			status: input.status,
			dataResolucao: input.status === "RESOLVIDO" ? now : current.dataResolucao,
			dataEncerramento: isTerminal ? now : current.dataEncerramento,
			encerradoPorUsuarioId: isTerminal ? (input.usuarioId ?? null) : current.encerradoPorUsuarioId,
			dataLiberacao: isTerminal ? now : current.dataLiberacao,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

/**
 * Encerra em lote os atendimentos ativos sem atividade no chat há mais tempo que o corte.
 *
 * O caso motivador é o EXTERNO: atendimento feito pelo telefone nunca passa pelo hub e o
 * ticket ficaria ativo para sempre. Fecha qualquer responsável — a próxima mensagem do
 * cliente abre um episódio novo via ensureCurrentAttendance, que é a fronteira correta.
 *
 * Set-based de propósito: uma varredura por chamada, sem loop por linha. Devolve as linhas
 * encerradas — ponto de acoplamento do incremento futuro de resumo por IA no encerramento.
 *
 * `encerradoPorUsuarioId` fica intocado e `dataResolucao` não é gravada: encerramento por
 * inatividade não é resolução, e o par (resultado INATIVIDADE, encerradoPor nulo) é o que
 * distingue o fechamento automático do manual nas estatísticas.
 */
export async function closeStaleChatAttendances(db: TAttendanceDb, input: { inactiveSince: Date; now?: Date }) {
	const now = input.now ?? new Date();

	const staleChats = db.select({ id: chats.id }).from(chats).where(lt(chats.ultimaMensagemData, input.inactiveSince));

	// Retomada agendada da IA: o silêncio que ela espera pode ser maior que a janela de inatividade,
	// e fechar o ticket cancelaria justamente o lembrete que existe para reativar o cliente.
	const hasScheduledFollowUp = db
		.select({ one: sql`1` })
		.from(aiAgentFollowUps)
		.where(and(eq(aiAgentFollowUps.atendimentoId, chatAssignments.id), eq(aiAgentFollowUps.status, "AGENDADA")));

	const closed = await db
		.update(chatAssignments)
		.set({
			status: "ENCERRADO",
			// Não sobrescreve um resultado que a IA ou o hub já tenham gravado.
			resultado: sql`COALESCE(${chatAssignments.resultado}, 'INATIVIDADE')`,
			dataEncerramento: now,
			dataLiberacao: now,
		})
		.where(
			and(
				notInArray(chatAssignments.status, CLOSED_ATTENDANCE_STATUSES),
				inArray(chatAssignments.chatId, staleChats),
				// Inatividade é do ticket, não só do chat: um ticket atribuído há minutos sobre um chat
				// antigo (alguém reabriu a conversa) não pode ser fechado pelo cron horário.
				// `dataAtribuicao` é notNull e reescrita a cada assumir/atribuir/transferir/claim.
				lt(chatAssignments.dataAtribuicao, input.inactiveSince),
				notExists(hasScheduledFollowUp),
			),
		)
		.returning({
			id: chatAssignments.id,
			chatId: chatAssignments.chatId,
			organizacaoId: chatAssignments.organizacaoId,
			responsavelTipo: chatAssignments.responsavelTipo,
		});

	// O cascade da FK já apagaria a retomada se o ticket fosse deletado; encerrado ele fica, e a
	// retomada precisa morrer com o episódio explicitamente.
	await cancelScheduledFollowUpsForChats(db, {
		chatIds: closed.map((row) => row.chatId),
		motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.ATENDIMENTO_ENCERRADO,
	});

	return closed;
}

/**
 * Grava o resumo do atendimento. É por aqui que a IA registra do que a conversa trata —
 * o campo que no modelo antigo era a `descricao` do serviço, quase sempre preenchida com
 * o placeholder "NÃO ESPECIFICADO".
 */
export async function updateChatAttendanceSummary(db: TAttendanceDb, input: { organizacaoId: string; chatId: string; resumo: string }) {
	// Sem ticket ativo não há o que resumir: `null` é "nada a atualizar", e quem chama decide se isso importa.
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;

	const [updated] = await db.update(chatAssignments).set({ resumo: input.resumo }).where(eq(chatAssignments.id, current.id)).returning();

	return updated ?? null;
}

/** Categoria do atendimento, preenchida pela triagem a partir da intenção do cliente. */
export async function updateChatAttendanceCategory(db: TAttendanceDb, input: { organizacaoId: string; chatId: string; categoria: string }) {
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;
	const [updated] = await db.update(chatAssignments).set({ categoria: input.categoria }).where(eq(chatAssignments.id, current.id)).returning();
	return updated ?? null;
}

export async function changeChatAttendancePriority(
	db: TAttendanceDb,
	input: { organizacaoId: string; chatId: string; prioridade: TChatAssignmentPriority | null },
) {
	// Sem `ensure`, pelo mesmo motivo de `changeChatAttendanceStatus`: prioridade não abre ticket.
	const current = await getCurrentChatAttendance(db, input);
	if (!current) return null;

	const [updated] = await db.update(chatAssignments).set({ prioridade: input.prioridade }).where(eq(chatAssignments.id, current.id)).returning();

	return updated ?? null;
}

/**
 * Encerra o atendimento com um resultado. Usado no handoff IA → humano
 * (`resultado: "HUMAN_HANDOFF"`) e no encerramento manual pelo hub.
 */
export async function closeChatAttendance(
	db: TAttendanceDb,
	input: {
		organizacaoId: string;
		chatId: string;
		status?: "RESOLVIDO" | "ENCERRADO";
		resultado?: string | null;
		usuarioId?: string | null;
		now?: Date;
	},
) {
	const now = input.now ?? new Date();
	const status = input.status ?? "ENCERRADO";
	const current = await ensureCurrentAttendance(db, { ...input, now, status });
	if (!current) return null;

	if (status === "ENCERRADO")
		await cancelScheduledFollowUp(db, { chatId: input.chatId, motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.ATENDIMENTO_ENCERRADO });

	const [updated] = await db
		.update(chatAssignments)
		.set({
			status,
			resultado: input.resultado ?? current.resultado,
			dataResolucao: status === "RESOLVIDO" ? now : current.dataResolucao,
			dataEncerramento: status === "ENCERRADO" ? now : current.dataEncerramento,
			encerradoPorUsuarioId: input.usuarioId ?? current.encerradoPorUsuarioId,
			dataLiberacao: status === "ENCERRADO" ? now : current.dataLiberacao,
		})
		.where(eq(chatAssignments.id, current.id))
		.returning();

	return updated ?? null;
}

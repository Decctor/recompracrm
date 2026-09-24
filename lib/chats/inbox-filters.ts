import type { TChatAssignmentStatus, TChatInboxPriorityFilter, TChatInboxQuickFilter, TChatInboxView } from "@/schemas/enums";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { clients } from "@/services/drizzle/schema/clients";
import { and, eq, gt, ilike, inArray, isNotNull, isNull, notInArray, or, type SQL } from "drizzle-orm";

/**
 * Condições da inbox compartilhadas entre a lista (`GET /api/chats`) e as contagens dos atalhos
 * (`GET /api/chats/inbox-counts`). As duas precisam concordar: uma pílula que diz "12 não lidas" e
 * abre uma lista com 11 faz o usuário desconfiar do número.
 *
 * Todas assumem a mesma forma de join: `clients` e a última `chat_messages` por `leftJoin`, e
 * `chat_assignments` restrito ao atendimento corrente (não-terminal).
 */
export type TChatInboxFilters = {
	userId: string;
	organizacaoId: string;
	view: TChatInboxView;
	status: TChatAssignmentStatus[];
	priority: TChatInboxPriorityFilter[];
	search?: string | null;
	whatsappConexaoTelefoneId?: string | null;
};

/**
 * Condição do `leftJoin` com `chat_assignments`: só o atendimento corrente. Não duplica linhas
 * porque o índice único parcial `idx_chat_assignments_one_current_per_chat` garante no máximo um
 * atendimento não-terminal por chat.
 */
export const currentChatAssignmentJoin = and(eq(chatAssignments.chatId, chats.id), notInArray(chatAssignments.status, ["ENCERRADO", "CANCELADO"]));

const HIGH_PRIORITY_LEVELS = ["ALTA", "URGENTE"] as const;

function buildViewCondition(view: TChatInboxView, userId: string) {
	if (view === "MINHAS") return eq(chatAssignments.responsavelUsuarioId, userId);
	if (view === "NAO_ATRIBUIDAS") return or(isNull(chatAssignments.id), eq(chatAssignments.responsavelTipo, "NAO_ATRIBUIDO"));
	if (view === "COM_AGENTE") return eq(chatAssignments.responsavelTipo, "AGENTE");
	return undefined;
}

function buildPriorityCondition(priority: TChatInboxPriorityFilter[]) {
	if (priority.length === 0) return undefined;
	const levels = priority.filter((level) => level !== "SEM_PRIORIDADE");
	const conditions: SQL[] = [];
	if (levels.length > 0) conditions.push(inArray(chatAssignments.prioridade, levels));
	// Sem atendimento corrente também é "sem prioridade": não há quem a defina.
	if (priority.includes("SEM_PRIORIDADE")) conditions.push(isNull(chatAssignments.prioridade));
	return or(...conditions);
}

export function buildChatInboxFilterConditions(filters: TChatInboxFilters) {
	const searchTerm = filters.search?.trim();
	return [
		eq(chats.organizacaoId, filters.organizacaoId),
		// Chats de teste do agente de IA não são atendimento real.
		eq(chats.origem, "WHATSAPP"),
		filters.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, filters.whatsappConexaoTelefoneId) : undefined,
		buildViewCondition(filters.view, filters.userId),
		// O join só traz atendimentos não-terminais, então o filtro opera sobre o atendimento
		// corrente; chats sem atendimento ativo ficam de fora quando há status selecionado
		// (eles não têm status a comparar).
		filters.status.length > 0 ? inArray(chatAssignments.status, filters.status) : undefined,
		buildPriorityCondition(filters.priority),
		searchTerm
			? or(ilike(clients.nome, `%${searchTerm}%`), ilike(clients.telefone, `%${searchTerm}%`), ilike(chatMessages.conteudoTexto, `%${searchTerm}%`))
			: undefined,
	];
}

export function buildChatInboxQuickFilterCondition(quickFilter: TChatInboxQuickFilter) {
	if (quickFilter === "NAO_LIDAS") return gt(chats.mensagensNaoLidas, 0);
	if (quickFilter === "AGUARDANDO_RESPOSTA") {
		// A última palavra foi do cliente: alguém do time deve a próxima mensagem.
		return and(
			isNotNull(chats.ultimaMensagemEntradaData),
			or(isNull(chats.ultimaMensagemSaidaData), gt(chats.ultimaMensagemEntradaData, chats.ultimaMensagemSaidaData)),
		);
	}
	if (quickFilter === "JANELA_ABERTA") return gt(chats.whatsappJanelaDataExpiracao, new Date());
	if (quickFilter === "PRIORITARIAS") return inArray(chatAssignments.prioridade, [...HIGH_PRIORITY_LEVELS]);
	return undefined;
}

import type { TChatAssignmentStatus } from "@/schemas/enums";

/**
 * Regras do quadro (kanban) de atendimentos.
 *
 * Compartilhadas entre a rota `/api/chats/board` (que decide o que consultar) e a UI
 * (que decide o que permite arrastar) — as duas precisam concordar sobre quais estados
 * são colunas e quais movimentos existem.
 */

/** Colunas do quadro, na ordem do fluxo. `CANCELADO` fica fora: é ação de menu, não etapa. */
export const CHAT_BOARD_STATUSES = [
	"ABERTO",
	"EM_ATENDIMENTO",
	"AGUARDANDO_CLIENTE",
	"AGUARDANDO_INTERNO",
	"RESOLVIDO",
	"ENCERRADO",
] as const satisfies readonly TChatAssignmentStatus[];

export type TChatBoardStatus = (typeof CHAT_BOARD_STATUSES)[number];

export function isChatBoardStatus(status: string): status is TChatBoardStatus {
	return (CHAT_BOARD_STATUSES as readonly string[]).includes(status);
}

/** Janela padrão (em dias) dos encerrados exibidos, para a coluna não virar arquivo morto. */
export const CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS = 3;
export const CHAT_BOARD_CLOSED_WINDOW_MAX_DAYS = 30;

/** Teto de cards por coluna. O excedente é anunciado no rodapé, nunca truncado em silêncio. */
export const CHAT_BOARD_COLUMN_LIMIT = 60;

/**
 * `ENCERRADO` é vitrine, não área de drop.
 *
 * `changeChatAttendanceStatus` só enxerga atendimentos não-terminais: aplicado a um ticket
 * encerrado não há o que alterar e a rota responde 409. Reabrir de verdade exigiria uma ação
 * própria em `lib/chats/attendance-state.ts`; até lá, o caminho legítimo de reabertura é o
 * cliente mandar uma mensagem nova (`markChatNeedsResponse`).
 */
export function isValidChatBoardTransition(from: TChatAssignmentStatus, to: TChatAssignmentStatus) {
	if (from === to) return false;
	if (from === "ENCERRADO" || from === "CANCELADO") return false;
	return isChatBoardStatus(to);
}

/**
 * Cancelar não é coluna — é ação de menu —, então não passa por `isValidChatBoardTransition`,
 * que só fala sobre destinos que existem como coluna.
 */
export function canCancelChatBoardAttendance(from: TChatAssignmentStatus) {
	return from !== "ENCERRADO" && from !== "CANCELADO";
}

/** Transições que perdem estado pedem confirmação: as duas terminais. */
export function chatBoardTransitionNeedsConfirmation(to: TChatAssignmentStatus) {
	return to === "ENCERRADO" || to === "CANCELADO";
}

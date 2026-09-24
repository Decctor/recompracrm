import type { TGetTransferTargetsOutput } from "@/app/api/chats/assignments/route";
import type { TGetChatMessagesOutput } from "@/app/api/chats/messages/route";
import type { TGetChatInboxCountsOutput } from "@/app/api/chats/inbox-counts/route";
import type { TGetChatsOutput } from "@/app/api/chats/route";
import type { TGetClientContextOutput } from "@/app/api/clients/context/route";
import type { TChatAssignmentStatus, TChatInboxPriorityFilter, TChatInboxQuickFilter, TChatInboxView } from "@/schemas/enums";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDebounceMemo } from "../hooks/use-debounce";

// ============= Fetch functions =============

type TChatsCursor = string | null;

/** Filtros da inbox comuns à lista e às contagens dos atalhos. */
type TChatInboxQueryFilters = {
	whatsappConexaoTelefoneId: string | null;
	view: TChatInboxView;
	search: string;
	status: TChatAssignmentStatus[];
	priority: TChatInboxPriorityFilter[];
};

function buildChatInboxSearchParams(params: TChatInboxQueryFilters) {
	const searchParams = new URLSearchParams();
	if (params.whatsappConexaoTelefoneId) searchParams.set("whatsappConexaoTelefoneId", params.whatsappConexaoTelefoneId);
	searchParams.set("view", params.view);
	if (params.search) searchParams.set("search", params.search);
	if (params.status.length > 0) searchParams.set("status", params.status.join(","));
	if (params.priority.length > 0) searchParams.set("priority", params.priority.join(","));
	return searchParams;
}

async function fetchChats(params: TChatInboxQueryFilters & { quickFilter: TChatInboxQuickFilter; cursor?: TChatsCursor }) {
	const searchParams = buildChatInboxSearchParams(params);
	if (params.quickFilter !== "TODAS") searchParams.set("quickFilter", params.quickFilter);
	if (params.cursor) searchParams.set("cursor", params.cursor);

	const { data } = await axios.get<TGetChatsOutput>(`/api/chats?${searchParams.toString()}`);
	if (!data.data.default) throw new Error("Não foi possível carregar os chats.");
	return data.data.default;
}

async function fetchChatInboxCounts(params: TChatInboxQueryFilters) {
	const { data } = await axios.get<TGetChatInboxCountsOutput>(`/api/chats/inbox-counts?${buildChatInboxSearchParams(params).toString()}`);
	return data.data;
}

async function fetchChatById(chatId: string) {
	const { data } = await axios.get<TGetChatsOutput>(`/api/chats?id=${chatId}`);
	if (!data.data.byId) throw new Error("Chat não encontrado.");
	return data.data.byId;
}

type TChatMessagesCursor = { dataEnvio: string; id: string } | null;

async function fetchChatMessages(params: { chatId: string; cursor?: TChatMessagesCursor }) {
	const searchParams = new URLSearchParams();
	searchParams.set("chatId", params.chatId);
	if (params.cursor) {
		searchParams.set("cursorDataEnvio", params.cursor.dataEnvio);
		searchParams.set("cursorId", params.cursor.id);
	}

	const { data } = await axios.get<TGetChatMessagesOutput>(`/api/chats/messages?${searchParams.toString()}`);
	return data.data;
}

async function fetchChatTransferTargets() {
	const { data } = await axios.get<TGetTransferTargetsOutput>("/api/chats/assignments");
	return data.data.usuarios;
}

async function fetchClientContext(clientId: string) {
	const { data } = await axios.get<TGetClientContextOutput>(`/api/clients/context?clientId=${clientId}`);
	return data.data;
}

// ============= Hooks =============

export type TChatInboxItem = NonNullable<TGetChatsOutput["data"]["default"]>["items"][number];
export type TChatMessagesPage = TGetChatMessagesOutput["data"];
export type TChatThreadMessage = TChatMessagesPage["items"][number];
export type TChatAttendance = TChatMessagesPage["chat"]["atendimentoAtivo"];

export function getChatsQueryKey({ quickFilter, ...filters }: TChatInboxQueryFilters & { quickFilter: TChatInboxQuickFilter }) {
	return ["chats", filters.whatsappConexaoTelefoneId, filters.view, filters.search, filters.status, filters.priority, quickFilter] as const;
}

export const CHAT_INBOX_COUNTS_QUERY_KEY_ROOT = "chat-inbox-counts";

type TUseChatsParams = {
	whatsappConexaoTelefoneId: string | null;
	view: TChatInboxView;
	search?: string;
	status?: TChatAssignmentStatus[];
	priority?: TChatInboxPriorityFilter[];
	quickFilter?: TChatInboxQuickFilter;
};

export function useChats({ whatsappConexaoTelefoneId, view, search = "", status = [], priority = [], quickFilter = "TODAS" }: TUseChatsParams) {
	// A busca vai para o servidor (o índice de chave natural + ordenação já suportam),
	// então precisa de debounce para não disparar uma query por tecla.
	const debounced = useDebounceMemo({ search }, 350);
	const filters = { whatsappConexaoTelefoneId, view, search: debounced.search, status, priority };
	const queryKey = getChatsQueryKey({ ...filters, quickFilter });

	const query = useInfiniteQuery({
		queryKey,
		queryFn: ({ pageParam }) => fetchChats({ ...filters, quickFilter, cursor: pageParam ?? undefined }),
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: null as TChatsCursor,
		refetchOnWindowFocus: false,
	});

	return { ...query, chats: query.data?.pages.flatMap((page) => page.items) ?? [], queryKey };
}

/**
 * Contagens das pílulas de atalho sob os mesmos filtros da lista (menos o próprio atalho).
 * `refetchInterval`: a janela de 24h expira sozinha, sem evento de banco que avise.
 */
export function useChatInboxCounts({
	whatsappConexaoTelefoneId,
	view,
	search = "",
	status = [],
	priority = [],
}: Omit<TUseChatsParams, "quickFilter">) {
	const debounced = useDebounceMemo({ search }, 350);
	const filters = { whatsappConexaoTelefoneId, view, search: debounced.search, status, priority };
	const queryKey = [CHAT_INBOX_COUNTS_QUERY_KEY_ROOT, filters] as const;
	return {
		...useQuery({ queryKey, queryFn: () => fetchChatInboxCounts(filters), refetchOnWindowFocus: false, refetchInterval: 60_000 }),
		queryKey,
	};
}

export function useChatById(chatId: string | null) {
	const queryKey = ["chat-by-id", chatId] as const;
	return { ...useQuery({ queryKey, queryFn: () => fetchChatById(chatId ?? ""), enabled: !!chatId }), queryKey };
}

export function getChatMessagesQueryKey(chatId: string | null) {
	return ["chat-messages", chatId] as const;
}

export function useChatMessages(chatId: string | null) {
	const queryKey = getChatMessagesQueryKey(chatId);
	const query = useInfiniteQuery({
		queryKey,
		queryFn: ({ pageParam }) => fetchChatMessages({ chatId: chatId ?? "", cursor: pageParam }),
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialPageParam: null as TChatMessagesCursor,
		enabled: !!chatId,
		refetchOnWindowFocus: false,
	});

	return {
		...query,
		// Páginas em DESC concatenadas seguem em DESC: a thread renderiza em
		// flex-col-reverse, então "mais antigas" entram no fim do array.
		messages: query.data?.pages.flatMap((page) => page.items) ?? [],
		chat: query.data?.pages[0]?.chat ?? null,
		queryKey,
	};
}

export function useChatTransferTargets({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["chat-transfer-targets"] as const;
	return { ...useQuery({ queryKey, queryFn: fetchChatTransferTargets, enabled, staleTime: 5 * 60 * 1000 }), queryKey };
}

export function useChatClientContext({ clienteId, enabled = true }: { clienteId: string | null; enabled?: boolean }) {
	const queryKey = ["chat-client-context", clienteId] as const;
	return {
		...useQuery({ queryKey, queryFn: () => fetchClientContext(clienteId ?? ""), enabled: enabled && !!clienteId }),
		queryKey,
	};
}

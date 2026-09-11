"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { mapRealtimeChatRow, type TRealtimeChatRow } from "@/lib/chats/realtime-mappers";
import { getErrorMessage } from "@/lib/errors";
import { useChats, type TChatInboxItem } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import { ChatAssignmentStatusEnum, ChatInboxViewEnum, type TChatAssignmentStatus, type TChatInboxView } from "@/schemas/enums";
import { supabaseClient } from "@/services/supabase";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { chatsInboxParsers } from "@/lib/chats/inbox-url-state";
import { ChevronDown, Inbox, Search, Sparkles, User, Users, X } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_META } from "./attendance-meta";
import { ChatInboxListItem } from "./ChatInboxListItem";

type TInboxPage = { items: TChatInboxItem[]; hasMore: boolean; nextCursor: string | null };

/**
 * ENCERRADO e CANCELADO ficam de fora: a inbox junta apenas o atendimento corrente
 * (não-terminal), então essas opções nunca casariam com nada — seriam filtros mortos.
 */
const FILTERABLE_STATUSES = (Object.keys(STATUS_META) as TChatAssignmentStatus[]).filter(
	(status) => status !== "ENCERRADO" && status !== "CANCELADO",
);

const INBOX_VIEWS: { id: TChatInboxView; label: string; icon: typeof Inbox }[] = [
	{ id: "MINHAS", label: "Minhas", icon: User },
	{ id: "NAO_ATRIBUIDAS", label: "Livres", icon: Inbox },
	{ id: "COM_AGENTE", label: "IA", icon: Sparkles },
	{ id: "TODAS", label: "Todas", icon: Users },
];

type ChatSidebarProps = {
	organizationId: string;
	selectedChatId: string | null;
	onSelectChat: (chatId: string) => void;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	className?: string;
};

/**
 * Último uso persistido por organização. Não compete com a URL pela posse do estado: `view` e
 * `status` vivem na URL (nuqs, ver `lib/chats/inbox-url-state.ts`) e o localStorage só a semeia
 * uma vez, quando ela chega limpa — depois disso ele apenas espelha o que a URL diz.
 *
 * Lido em efeito, não no inicializador do useState: o servidor não tem localStorage e ler no
 * primeiro render produziria markup diferente do cliente (erro de hidratação).
 */
const FILTERS_STORAGE_PREFIX = "chat-inbox-filters";

type TPersistedFilters = { view: TChatInboxView; selectedPhoneId: string | null; statusFilter: TChatAssignmentStatus[] };

export function ChatSidebar({ organizationId, selectedChatId, onSelectChat, whatsappConnections, className }: ChatSidebarProps) {
	// A URL é a dona de `view` e `status`: deep-links do dashboard (`?view=TODAS&status=ABERTO`)
	// e filtros escolhidos aqui são o mesmo estado, compartilhável por definição.
	const [inboxFilters, setInboxFilters] = useQueryStates(chatsInboxParsers, { history: "replace" });
	const view = inboxFilters.view;
	const statusFilter = inboxFilters.status;
	const [search, setSearch] = useState("");
	const [selectedPhoneId, setSelectedPhoneId] = useState<string | null>(null);
	const [filtersLoaded, setFiltersLoaded] = useState(false);
	const queryClient = useQueryClient();
	const initialSubscriptionCompleteRef = useRef(false);
	const seededRef = useRef(false);

	const phones = useMemo(() => whatsappConnections.flatMap((connection) => connection.telefones ?? []), [whatsappConnections]);
	const selectedPhone = phones.find((phone) => phone.id === selectedPhoneId) ?? null;
	const storageKey = `${FILTERS_STORAGE_PREFIX}-${organizationId}`;

	useEffect(() => {
		// Semeadura única na montagem (o pai só renderiza com as conexões já carregadas).
		if (seededRef.current) return;
		seededRef.current = true;
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<TPersistedFilters>;
				// A URL chegou limpa? Então o último uso vira o estado inicial. Se veio com qualquer
				// filtro (deep-link), ela já é o estado e o salvo não opina.
				const urlIsClean = !new URLSearchParams(window.location.search).has("view") && !new URLSearchParams(window.location.search).has("status");
				if (urlIsClean) {
					const savedView = ChatInboxViewEnum.safeParse(parsed.view);
					const savedStatuses = Array.isArray(parsed.statusFilter)
						? parsed.statusFilter.flatMap((s) => (ChatAssignmentStatusEnum.safeParse(s).success ? [s as TChatAssignmentStatus] : []))
						: [];
					void setInboxFilters({
						...(savedView.success ? { view: savedView.data } : {}),
						...(savedStatuses.length > 0 ? { status: savedStatuses } : {}),
					});
				}
				// Um telefone salvo pode ter sido removido da organização desde então;
				// restaurar um filtro inexistente esvaziaria a inbox sem explicação.
				if (parsed.selectedPhoneId && phones.some((phone) => phone.id === parsed.selectedPhoneId)) {
					setSelectedPhoneId(parsed.selectedPhoneId);
				}
			}
		} catch {
			// Storage indisponível ou JSON corrompido: seguir com os padrões.
		}
		setFiltersLoaded(true);
	}, [storageKey, phones, setInboxFilters]);

	useEffect(() => {
		if (!filtersLoaded) return;
		try {
			window.localStorage.setItem(storageKey, JSON.stringify({ view, selectedPhoneId, statusFilter } satisfies TPersistedFilters));
		} catch {
			// Modo privado / quota estourada: o filtro só não persiste.
		}
	}, [filtersLoaded, storageKey, view, selectedPhoneId, statusFilter]);

	const { chats, isPending, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage, queryKey } = useChats({
		whatsappConexaoTelefoneId: selectedPhoneId,
		view,
		search,
		status: statusFilter,
	});

	// A key muda com view/busca/telefone; o canal precisa sempre patchar a key corrente.
	const queryKeyRef = useRef(queryKey);
	queryKeyRef.current = queryKey;

	useEffect(() => {
		const channel = supabaseClient
			.channel(`chats-sidebar-${organizationId}`)
			.on(
				"postgres_changes",
				{ event: "UPDATE", schema: "public", table: "ampmais_chats", filter: `organizacao_id=eq.${organizationId}` },
				(payload) => {
					const row = payload.new as TRealtimeChatRow;
					const patch = mapRealtimeChatRow(row);
					let precisaInvalidar = false;

					queryClient.setQueryData<InfiniteData<TInboxPage>>(queryKeyRef.current, (current) => {
						if (!current) return current;
						const existente = current.pages.flatMap((page) => page.items).find((item) => item.id === row.id);
						// Uma última mensagem nova muda o preview, que vem de um join — o patch
						// não alcança. Comparamos com o cache em vez de usar payload.old, que só
						// traz a PK sob REPLICA IDENTITY DEFAULT.
						if (!existente || existente.ultimaMensagemId !== patch.ultimaMensagemId) {
							precisaInvalidar = true;
							return current;
						}
						return {
							...current,
							pages: current.pages.map((page) => ({
								...page,
								items: page.items
									// ultimaMensagemData é NOT NULL na tabela; o mapeador a tipa como
									// nullable porque o payload do realtime é cru. Mantemos o valor
									// atual em vez de propagar um null que o tipo da lista não admite.
									.map((item) => (item.id === row.id ? { ...item, ...patch, ultimaMensagemData: patch.ultimaMensagemData ?? item.ultimaMensagemData } : item))
									.sort((a, b) => b.ultimaMensagemData.getTime() - a.ultimaMensagemData.getTime()),
							})),
						};
					});

					if (precisaInvalidar) void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
				},
			)
			// Uma mudança de atribuição move o chat entre views: não dá para patchar no lugar.
			.on("postgres_changes", { event: "*", schema: "public", table: "ampmais_chat_assignments", filter: `organizacao_id=eq.${organizationId}` }, () => {
				void queryClient.invalidateQueries({ queryKey: ["chats"] });
			})
			.on("postgres_changes", { event: "INSERT", schema: "public", table: "ampmais_chats", filter: `organizacao_id=eq.${organizationId}` }, () => {
				void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
			})
			.subscribe((status) => {
				if (status !== "SUBSCRIBED") return;
				// A primeira inscrição não precisa invalidar (a query acabou de rodar); as
				// seguintes são reconexões, e aí o cache pode ter perdido eventos.
				if (!initialSubscriptionCompleteRef.current) {
					initialSubscriptionCompleteRef.current = true;
					return;
				}
				void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
			});

		return () => {
			initialSubscriptionCompleteRef.current = false;
			void supabaseClient.removeChannel(channel);
		};
	}, [organizationId, queryClient]);

	const selectedViewMeta = INBOX_VIEWS.find((item) => item.id === view) ?? INBOX_VIEWS[0];
	const SelectedViewIcon = selectedViewMeta.icon;

	return (
		<aside className={cn("flex h-full min-h-0 w-full min-w-0 flex-col border-r border-border bg-background", className)}>
			<div className="flex flex-col gap-2 border-b border-border p-3">
				<div className="flex flex-wrap items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="outline" size="sm" className="h-8 gap-1.5">
									<SelectedViewIcon className="h-3.5 w-3.5" />
									{selectedViewMeta.label}
									<ChevronDown className="h-3 w-3 opacity-60" />
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuGroup>
								{INBOX_VIEWS.map((item) => (
									<DropdownMenuItem key={item.id} onClick={() => void setInboxFilters({ view: item.id })} className="gap-2">
										<item.icon className="h-3.5 w-3.5" />
										{item.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					{selectedPhone ? (
						<button
							type="button"
							onClick={() => setSelectedPhoneId(null)}
							aria-label={`Remover filtro de número: ${selectedPhone.numero || selectedPhone.nome}`}
							className="flex h-8 min-w-0 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<span className="truncate">{selectedPhone.numero || selectedPhone.nome}</span>
							<X className="h-3 w-3 shrink-0 opacity-60" />
						</button>
					) : (
						phones.length > 1 && (
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
											Número
											<ChevronDown className="h-3 w-3 opacity-60" />
										</Button>
									}
								/>
								<DropdownMenuContent align="start">
									<DropdownMenuGroup>
										{phones.map((phone) => (
											<DropdownMenuItem key={phone.id} onClick={() => setSelectedPhoneId(phone.id)}>
												{phone.numero || phone.nome}
											</DropdownMenuItem>
										))}
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)
					)}

					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant={statusFilter.length > 0 ? "outline" : "ghost"} size="sm" className="h-8 gap-1 text-xs">
									Status
									{statusFilter.length > 0 && (
										<span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{statusFilter.length}</span>
									)}
									<ChevronDown className="h-3 w-3 opacity-60" />
								</Button>
							}
						/>
						<DropdownMenuContent align="start">
							<DropdownMenuGroup>
								{FILTERABLE_STATUSES.map((status) => (
									<DropdownMenuCheckboxItem
										key={status}
										checked={statusFilter.includes(status)}
										// Sem o preventDefault o menu fecharia a cada clique — inviável
										// para uma seleção múltipla.
										onClick={(event) => event.preventDefault()}
										onCheckedChange={(checked) =>
											void setInboxFilters((current) => ({ status: checked ? [...current.status, status] : current.status.filter((item) => item !== status) }))
										}
									>
										<span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[status].dot)} />
										{STATUS_META[status].label}
									</DropdownMenuCheckboxItem>
								))}
								{statusFilter.length > 0 && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => void setInboxFilters({ status: [] })}>Limpar filtro</DropdownMenuItem>
									</>
								)}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				<div className="relative">
					<Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						aria-label="Buscar conversas"
						placeholder="Buscar por nome, telefone ou mensagem"
						className="h-8 pl-7 text-xs"
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{isPending && <LoadingComponent />}
				{isError && <ErrorComponent msg={getErrorMessage(error)} />}
				{!isPending && !isError && chats.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa nesta visão.</p>}
				{chats.map((chat) => (
					<ChatInboxListItem
						key={chat.id}
						chat={chat}
						isSelected={chat.id === selectedChatId}
						// Com filtro ativo o número é redundante — ele já está no chip acima.
						showPhoneBadge={!selectedPhoneId && phones.length > 1}
						onSelect={onSelectChat}
					/>
				))}
				{hasNextPage && (
					<div className="p-3">
						<Button variant="ghost" size="sm" className="w-full text-xs" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
							{isFetchingNextPage ? "Carregando..." : "Carregar mais conversas"}
						</Button>
					</div>
				)}
			</div>
		</aside>
	);
}

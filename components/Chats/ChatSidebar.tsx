"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { Button } from "@/components/ui/button";
import { chipVariants } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chatsInboxParsers } from "@/lib/chats/inbox-url-state";
import { mapRealtimeChatRow, type TRealtimeChatRow } from "@/lib/chats/realtime-mappers";
import { getErrorMessage } from "@/lib/errors";
import { CHAT_INBOX_COUNTS_QUERY_KEY_ROOT, useChatInboxCounts, useChats, type TChatInboxItem } from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import {
	ChatAssignmentStatusEnum,
	ChatInboxPriorityFilterEnum,
	ChatInboxViewEnum,
	type TChatAssignmentStatus,
	type TChatInboxPriorityFilter,
	type TChatInboxQuickFilter,
	type TChatInboxView,
} from "@/schemas/enums";
import { supabaseClient } from "@/services/supabase";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Inbox,
	LayoutGrid,
	type LucideIcon,
	RefreshCw,
	Search,
	SlidersHorizontal,
	Smartphone,
	Sparkles,
	UserRound,
	UserRoundPlus,
} from "lucide-react";
import { useQueryStates } from "nuqs";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PRIORITY_META, STATUS_META } from "./attendance-meta";
import { ChatInboxListItem } from "./ChatInboxListItem";

type TInboxPage = { items: TChatInboxItem[]; hasMore: boolean; nextCursor: string | null };

/**
 * ENCERRADO e CANCELADO ficam de fora: a inbox junta apenas o atendimento corrente
 * (não-terminal), então essas opções nunca casariam com nada — seriam filtros mortos.
 */
const FILTERABLE_STATUSES = (Object.keys(STATUS_META) as TChatAssignmentStatus[]).filter(
	(status) => status !== "ENCERRADO" && status !== "CANCELADO",
);

/**
 * Responsabilidade em primeiro plano: é a pergunta que o atendente faz antes de qualquer outra
 * ("o que é meu, o que está livre"), por isso ganha um controle segmentado sempre visível em vez
 * de um dropdown que esconde a visão atual.
 */
const INBOX_VIEWS = [
	{ id: "NAO_ATRIBUIDAS", label: "Livres", icon: UserRoundPlus },
	{ id: "MINHAS", label: "Minhas", icon: UserRound },
	{ id: "COM_AGENTE", label: "IA", icon: Sparkles },
	{ id: "TODAS", label: "Todas", icon: LayoutGrid },
] as const satisfies readonly { id: TChatInboxView; label: string; icon: LucideIcon }[];

/**
 * Atalhos no estilo das pílulas do WhatsApp: um toque aplica, a contagem diz se vale a pena tocar.
 * "Não lidas" ganha a bolha cheia porque é o único sinal que exige ação imediata; os demais mostram
 * a contagem em texto.
 */
const QUICK_FILTERS = [
	{ id: "TODAS", label: "Tudo" },
	{ id: "NAO_LIDAS", label: "Não lidas" },
	{ id: "AGUARDANDO_RESPOSTA", label: "Aguardando resposta" },
	{ id: "JANELA_ABERTA", label: "Janela aberta" },
	{ id: "PRIORITARIAS", label: "Prioritárias" },
] as const satisfies readonly { id: TChatInboxQuickFilter; label: string }[];

const QUICK_FILTER_EMPTY_HINT: Record<TChatInboxQuickFilter, string> = {
	TODAS: "Nenhuma conversa nesta visão — novas conversas aparecem em tempo real.",
	NAO_LIDAS: "Tudo lido. Mensagens novas aparecem aqui assim que chegarem.",
	AGUARDANDO_RESPOSTA: "Nenhum cliente esperando resposta do time.",
	JANELA_ABERTA: "Nenhuma conversa com janela de 24h aberta.",
	PRIORITARIAS: "Nenhum atendimento com prioridade alta ou urgente.",
};

const PRIORITY_FILTER_OPTIONS: { value: TChatInboxPriorityFilter; label: string; icon: LucideIcon | null }[] = [
	...(["URGENTE", "ALTA", "MEDIA", "BAIXA"] as const).map((priority) => ({
		value: priority,
		label: PRIORITY_META[priority].label,
		icon: PRIORITY_META[priority].icon,
	})),
	{ value: "SEM_PRIORIDADE", label: "Sem prioridade", icon: null },
];

function toggleValue<T>(values: T[], value: T) {
	return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

type ChatSidebarProps = {
	organizationId: string;
	selectedChatId: string | null;
	onSelectChat: (chatId: string) => void;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	className?: string;
};

/**
 * Último uso persistido por organização. Não compete com a URL pela posse do estado: visão,
 * status, prioridade e atalho vivem na URL (nuqs, ver `lib/chats/inbox-url-state.ts`) e o
 * localStorage só a semeia uma vez, quando ela chega limpa — depois disso ele apenas espelha o que
 * a URL diz. O atalho não é persistido: reabrir a inbox presa em "Não lidas" esconderia conversas
 * sem explicação.
 *
 * Lido em efeito, não no inicializador do useState: o servidor não tem localStorage e ler no
 * primeiro render produziria markup diferente do cliente (erro de hidratação).
 */
const FILTERS_STORAGE_PREFIX = "chat-inbox-filters";

type TPersistedFilters = {
	view: TChatInboxView;
	selectedPhoneId: string | null;
	statusFilter: TChatAssignmentStatus[];
	priorityFilter: TChatInboxPriorityFilter[];
};

function parseEnumArray<T extends string>(values: unknown, parse: (value: unknown) => { success: boolean; data?: T }) {
	if (!Array.isArray(values)) return [];
	return values.flatMap((value) => {
		const result = parse(value);
		return result.success && result.data ? [result.data] : [];
	});
}

export function ChatSidebar({ organizationId, selectedChatId, onSelectChat, whatsappConnections, className }: ChatSidebarProps) {
	// A URL é a dona dos filtros: deep-links do dashboard (`?view=TODAS&status=ABERTO`) e filtros
	// escolhidos aqui são o mesmo estado, compartilhável por definição.
	const [inboxFilters, setInboxFilters] = useQueryStates(chatsInboxParsers, { history: "replace" });
	const { view, status: statusFilter, priority: priorityFilter, quick: quickFilter } = inboxFilters;
	const [search, setSearch] = useState("");
	const [selectedPhoneId, setSelectedPhoneId] = useState<string | null>(null);
	const [filtersLoaded, setFiltersLoaded] = useState(false);
	const queryClient = useQueryClient();
	const initialSubscriptionCompleteRef = useRef(false);
	const seededRef = useRef(false);

	const phones = useMemo(() => whatsappConnections.flatMap((connection) => connection.telefones ?? []), [whatsappConnections]);
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
				const urlParams = new URLSearchParams(window.location.search);
				const urlIsClean = Object.keys(chatsInboxParsers).every((key) => !urlParams.has(key));
				if (urlIsClean) {
					const savedView = ChatInboxViewEnum.safeParse(parsed.view);
					const savedStatuses = parseEnumArray(parsed.statusFilter, (value) => ChatAssignmentStatusEnum.safeParse(value));
					const savedPriorities = parseEnumArray(parsed.priorityFilter, (value) => ChatInboxPriorityFilterEnum.safeParse(value));
					void setInboxFilters({
						...(savedView.success ? { view: savedView.data } : {}),
						...(savedStatuses.length > 0 ? { status: savedStatuses } : {}),
						...(savedPriorities.length > 0 ? { priority: savedPriorities } : {}),
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
			window.localStorage.setItem(storageKey, JSON.stringify({ view, selectedPhoneId, statusFilter, priorityFilter } satisfies TPersistedFilters));
		} catch {
			// Modo privado / quota estourada: o filtro só não persiste.
		}
	}, [filtersLoaded, storageKey, view, selectedPhoneId, statusFilter, priorityFilter]);

	const filters = { whatsappConexaoTelefoneId: selectedPhoneId, view, search, status: statusFilter, priority: priorityFilter };
	const { chats, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, queryKey } = useChats({
		...filters,
		quickFilter,
	});
	const { data: counts } = useChatInboxCounts(filters);

	// A key muda com view/busca/telefone; o canal precisa sempre patchar a key corrente.
	const queryKeyRef = useRef(queryKey);
	queryKeyRef.current = queryKey;

	useEffect(() => {
		// Rajadas de mensagens disparam vários UPDATEs em sequência; as contagens só precisam
		// refletir o estado final.
		let countsTimer: ReturnType<typeof setTimeout> | null = null;
		const scheduleCountsRefresh = () => {
			if (countsTimer) return;
			countsTimer = setTimeout(() => {
				countsTimer = null;
				void queryClient.invalidateQueries({ queryKey: [CHAT_INBOX_COUNTS_QUERY_KEY_ROOT] });
			}, 800);
		};

		const channel = supabaseClient
			.channel(`chats-sidebar-${organizationId}`)
			.on(
				"postgres_changes",
				{ event: "UPDATE", schema: "public", table: "ampmais_chats", filter: `organizacao_id=eq.${organizationId}` },
				(payload) => {
					const row = payload.new as TRealtimeChatRow;
					const patch = mapRealtimeChatRow(row);
					let precisaInvalidar = false;
					scheduleCountsRefresh();

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
				scheduleCountsRefresh();
			})
			.on("postgres_changes", { event: "INSERT", schema: "public", table: "ampmais_chats", filter: `organizacao_id=eq.${organizationId}` }, () => {
				void queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
				scheduleCountsRefresh();
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
				scheduleCountsRefresh();
			});

		return () => {
			if (countsTimer) clearTimeout(countsTimer);
			initialSubscriptionCompleteRef.current = false;
			void supabaseClient.removeChannel(channel);
		};
	}, [organizationId, queryClient]);

	const loadMoreRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const sentinel = loadMoreRef.current;
		if (!sentinel || !hasNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
			},
			{ rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const advancedFilterCount = (selectedPhoneId ? 1 : 0) + statusFilter.length + priorityFilter.length;
	const hasAnyFilter = advancedFilterCount > 0 || quickFilter !== "TODAS" || !!search;

	function clearAdvancedFilters() {
		setSelectedPhoneId(null);
		void setInboxFilters({ status: [], priority: [] });
	}

	function clearAllFilters() {
		clearAdvancedFilters();
		setSearch("");
		void setInboxFilters({ quick: "TODAS" });
	}

	return (
		<aside className={cn("flex h-full min-h-0 w-full min-w-0 flex-col border-r border-border bg-background", className)}>
			<div className="flex flex-col gap-2.5 border-b border-border px-3 pt-3 pb-3 lg:px-4 lg:pt-4">
				{/* No compacto o título da página já anuncia "Conversas"; repetir "Caixa de entrada"
				    custaria uma linha inteira de altura útil. */}
				<div className="hidden items-baseline justify-between gap-3 lg:flex">
					<h2 className="text-base font-semibold tracking-tight">Caixa de entrada</h2>
					{counts ? (
						<span className="text-[11px] tabular-nums text-muted-foreground">
							{counts.TODAS} {counts.TODAS === 1 ? "conversa" : "conversas"}
						</span>
					) : null}
				</div>

				<div role="group" aria-label="Responsável pelas conversas" className="grid grid-cols-4 gap-0.5 rounded-xl bg-muted p-0.5">
					{INBOX_VIEWS.map((item) => {
						const isActive = view === item.id;
						return (
							<button
								key={item.id}
								type="button"
								aria-pressed={isActive}
								onClick={() => void setInboxFilters({ view: item.id })}
								className={cn(
									"flex min-w-0 items-center justify-center gap-1.5 rounded-[0.625rem] py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
									isActive ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
								)}
							>
								<item.icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
								<span className="truncate">{item.label}</span>
							</button>
						);
					})}
				</div>

				<div className="flex items-center gap-2">
					<div className="relative min-w-0 flex-1">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							aria-label="Buscar conversas"
							placeholder="Buscar nome, telefone ou mensagem"
							className="h-9 border-transparent bg-muted/50 pl-8 text-xs placeholder:text-muted-foreground/70 focus-visible:bg-background lg:h-8"
						/>
					</div>

					<Popover>
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant={advancedFilterCount > 0 ? "secondary" : "outline"}
									size="icon-sm"
									className="relative size-9 shrink-0 lg:size-8"
									aria-label={advancedFilterCount > 0 ? `Filtros (${advancedFilterCount} ativos)` : "Filtros"}
								>
									<SlidersHorizontal />
									{advancedFilterCount > 0 ? (
										<span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
											{advancedFilterCount}
										</span>
									) : null}
								</Button>
							}
						/>
						<PopoverContent align="end" className="w-80 gap-0 p-0">
							<div className="flex items-center justify-between border-b border-border px-4 py-3">
								<p className="text-sm font-semibold tracking-tight">Filtros</p>
								{advancedFilterCount > 0 ? (
									<Button type="button" variant="ghost" size="xs" onClick={clearAdvancedFilters}>
										Limpar
									</Button>
								) : null}
							</div>
							<div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-4 py-3">
								{phones.length > 1 ? (
									<FilterSection title="Número">
										<div className="flex flex-col gap-0.5">
											<PhoneOption selected={selectedPhoneId == null} onSelect={() => setSelectedPhoneId(null)} icon={LayoutGrid} name="Todos os números" />
											{phones.map((phone) => (
												<PhoneOption
													key={phone.id}
													selected={phone.id === selectedPhoneId}
													onSelect={() => setSelectedPhoneId(phone.id)}
													icon={Smartphone}
													name={phone.nome || phone.numero}
													detail={phone.nome ? phone.numero : null}
												/>
											))}
										</div>
									</FilterSection>
								) : null}

								<FilterSection title="Status do atendimento">
									<div className="flex flex-wrap gap-1.5">
										{FILTERABLE_STATUSES.map((status) => {
											const meta = STATUS_META[status];
											return (
												<ToggleChip
													key={status}
													selected={statusFilter.includes(status)}
													onToggle={() => void setInboxFilters((current) => ({ status: toggleValue(current.status, status) }))}
													icon={<span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />}
													label={meta.label}
												/>
											);
										})}
									</div>
								</FilterSection>

								<FilterSection title="Prioridade">
									<div className="flex flex-wrap gap-1.5">
										{PRIORITY_FILTER_OPTIONS.map((option) => (
											<ToggleChip
												key={option.value}
												selected={priorityFilter.includes(option.value)}
												onToggle={() => void setInboxFilters((current) => ({ priority: toggleValue(current.priority, option.value) }))}
												icon={option.icon ? <option.icon className="h-3.5 w-3.5" /> : null}
												label={option.label}
											/>
										))}
									</div>
								</FilterSection>
							</div>
						</PopoverContent>
					</Popover>
				</div>

				<HorizontalScroller ariaLabel="Atalhos de filtro">
					{QUICK_FILTERS.map((filter) => {
						const isActive = quickFilter === filter.id;
						const count = filter.id === "TODAS" ? null : (counts?.[filter.id] ?? null);
						const isUnreadBubble = filter.id === "NAO_LIDAS" && !!count;
						return (
							<button
								key={filter.id}
								type="button"
								aria-pressed={isActive}
								onClick={() => void setInboxFilters({ quick: isActive && filter.id !== "TODAS" ? "TODAS" : filter.id })}
								className={cn(
									chipVariants({ variant: "outline", size: "md", shape: "pill" }),
									"cursor-pointer font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
									isActive ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{filter.label}
								{isUnreadBubble ? (
									<span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
										{count > 99 ? "99+" : count}
									</span>
								) : count ? (
									<span className="tabular-nums opacity-70">{count > 99 ? "99+" : count}</span>
								) : null}
							</button>
						);
					})}
				</HorizontalScroller>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-foreground/15">
				{isError ? (
					<EmptyState
						tone="error"
						title="Não foi possível carregar"
						description={getErrorMessage(error)}
						action={
							<Button type="button" variant="outline" size="xs" onClick={() => void refetch()}>
								<RefreshCw />
								Tentar novamente
							</Button>
						}
					/>
				) : isPending ? (
					<ChatListSkeleton />
				) : chats.length === 0 ? (
					<EmptyState
						title={hasAnyFilter ? "Nenhum resultado" : "Caixa vazia"}
						description={
							search
								? "Tente outro nome, telefone ou trecho de mensagem."
								: advancedFilterCount > 0
									? "Nenhuma conversa combina com os filtros aplicados."
									: QUICK_FILTER_EMPTY_HINT[quickFilter]
						}
						action={
							hasAnyFilter ? (
								<Button type="button" variant="outline" size="xs" onClick={clearAllFilters}>
									Limpar filtros
								</Button>
							) : null
						}
					/>
				) : (
					<>
						{chats.map((chat) => (
							<ChatInboxListItem
								key={chat.id}
								chat={chat}
								isSelected={chat.id === selectedChatId}
								// Com filtro ativo o número é redundante — ele já está no filtro.
								showPhoneBadge={!selectedPhoneId && phones.length > 1}
								onSelect={onSelectChat}
							/>
						))}
						{hasNextPage ? (
							<div ref={loadMoreRef} className="px-4 py-3 text-center text-[11px] text-muted-foreground">
								{isFetchingNextPage ? "Carregando..." : null}
							</div>
						) : null}
					</>
				)}
			</div>
		</aside>
	);
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
			{children}
		</div>
	);
}

function PhoneOption({
	selected,
	onSelect,
	icon: Icon,
	name,
	detail,
}: {
	selected: boolean;
	onSelect: () => void;
	icon: LucideIcon;
	name: string;
	detail?: string | null;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onSelect}
			className={cn(
				"flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
			)}
		>
			<Icon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium">{name}</span>
				{detail ? <span className={cn("truncate text-[11px]", selected ? "text-primary/70" : "text-muted-foreground")}>{detail}</span> : null}
			</span>
			{selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
		</button>
	);
}

function ToggleChip({ selected, onToggle, icon, label }: { selected: boolean; onToggle: () => void; icon: ReactNode; label: string }) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onToggle}
			className={cn(
				chipVariants({ variant: "outline", size: "sm", shape: "pill" }),
				"cursor-pointer py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				selected ? "border-primary/30 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			{icon}
			{label}
			{selected ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
		</button>
	);
}

function ChatListSkeleton() {
	return (
		<div aria-hidden>
			{Array.from({ length: 6 }).map((_, index) => (
				<div key={index} className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-2.5">
					<div className="flex items-center justify-between gap-2">
						<div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
						<div className="h-3 w-10 animate-pulse rounded-full bg-muted" />
					</div>
					<div className="h-3 w-full animate-pulse rounded-full bg-muted/70" />
					<div className="flex items-center gap-2">
						<div className="size-6 shrink-0 animate-pulse rounded-full bg-muted" />
						<div className="h-3 w-24 animate-pulse rounded-full bg-muted/70" />
					</div>
				</div>
			))}
		</div>
	);
}

function EmptyState({
	title,
	description,
	action,
	tone = "default",
}: {
	title: string;
	description: string;
	action?: ReactNode;
	tone?: "default" | "error";
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
			<div
				className={cn(
					"flex h-10 w-10 items-center justify-center rounded-full",
					tone === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
				)}
			>
				<Inbox className="h-5 w-5" />
			</div>
			<div className="space-y-0.5">
				<p className="text-xs font-semibold text-foreground">{title}</p>
				<p className="max-w-60 text-[11px] text-muted-foreground">{description}</p>
			</div>
			{action}
		</div>
	);
}

/**
 * Faixa horizontal sem barra de rolagem: setas aparecem só no lado em que há conteúdo escondido,
 * com um degradê que avisa o corte antes do clique.
 */
function HorizontalScroller({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const [edges, setEdges] = useState({ start: false, end: false });

	useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const update = () => {
			// 1px de folga: zoom fracionário deixa scrollLeft em subpixel.
			setEdges({
				start: scroller.scrollLeft > 1,
				end: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
			});
		};
		update();
		scroller.addEventListener("scroll", update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(scroller);
		for (const child of Array.from(scroller.children)) observer.observe(child);
		return () => {
			scroller.removeEventListener("scroll", update);
			observer.disconnect();
		};
	}, []);

	function scrollBy(direction: 1 | -1) {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		scroller.scrollBy({ left: direction * scroller.clientWidth * 0.7, behavior: "smooth" });
	}

	return (
		<div className="relative">
			<div
				ref={scrollerRef}
				role="group"
				aria-label={ariaLabel}
				className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{children}
			</div>
			{edges.start ? <ScrollArrow direction={-1} onClick={() => scrollBy(-1)} /> : null}
			{edges.end ? <ScrollArrow direction={1} onClick={() => scrollBy(1)} /> : null}
		</div>
	);
}

function ScrollArrow({ direction, onClick }: { direction: 1 | -1; onClick: () => void }) {
	const Icon = direction === 1 ? ChevronRight : ChevronLeft;
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-y-0 flex w-12 items-center from-background from-45% to-transparent",
				direction === 1 ? "right-0 justify-end bg-linear-to-l" : "left-0 justify-start bg-linear-to-r",
			)}
		>
			<button
				type="button"
				onClick={onClick}
				aria-label={direction === 1 ? "Ver mais atalhos" : "Ver atalhos anteriores"}
				className="pointer-events-auto flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<Icon className="h-4 w-4" />
			</button>
		</div>
	);
}

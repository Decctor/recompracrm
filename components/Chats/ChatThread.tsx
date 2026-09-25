"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { resolveAiPresence } from "@/lib/chats/ai-presence";
import { mapRealtimeAiRunRow, mapRealtimeMessageRow, type TRealtimeAiRunRow, type TRealtimeChatMessageRow } from "@/lib/chats/realtime-mappers";
import { AI_AGENT_RUNS_QUERY_KEY_ROOT } from "@/lib/queries/ai-agents";
import { getWhatsappWindowDisplay } from "@/lib/chats/whatsapp-window-status";
import { getErrorMessage } from "@/lib/errors";
import { markChatRead, retryChatMessage, sendChatMessage, updateChatAssignment } from "@/lib/mutations/chats";
import {
	getChatMessagesQueryKey,
	useChatMessages,
	type TChatAttendance,
	type TChatInboxItem,
	type TChatMessagesPage,
	type TChatThreadMessage,
} from "@/lib/queries/chats";
import { cn } from "@/lib/utils";
import { supabaseClient } from "@/services/supabase";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Loader2, PanelRightClose, PanelRightOpen, Plus, Smartphone, Sparkles, UserRound, UserRoundPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import AgentRunDrawer from "@/components/Settings/AiAgent/AgentRunDrawer";
import { AiPresenceBar } from "./AiPresenceBar";
import { AttendanceSummaryCard } from "./AttendanceSummaryCard";
import { ChatAssignmentActions } from "./ChatAssignmentActions";
import { ChatContextPanel } from "./ChatContextPanel";
import { ChatInputArea, type TChatInputAreaHandle, type TOutgoingAttachment } from "./ChatInputArea";
import { ChatMessageBubble, type TOptimisticFields } from "./ChatMessageBubble";
import { ChatQuotesHeaderActions } from "./Quotes/ChatQuotesHeaderActions";
import type { TQuotePermissions } from "./Quotes/config";

type TThreadMessage = TChatThreadMessage & TOptimisticFields & { clientTempId?: string };
type TInboxPage = { items: TChatInboxItem[]; hasMore: boolean; nextCursor: string | null };

type ChatThreadProps = {
	chatId: string;
	organizationId: string;
	currentUser: { id: string; nome: string; avatarUrl: string | null };
	quotePermissions: TQuotePermissions;
	/** Celular: a lista fica escondida enquanto a conversa está aberta, e este é o caminho de volta. */
	onBack?: () => void;
};

function insertMessageIntoCache(data: InfiniteData<TChatMessagesPage> | undefined, message: TChatThreadMessage) {
	if (!data?.pages.length) return data;
	const [firstPage, ...restPages] = data.pages;
	if (firstPage.items.some((item) => item.id === message.id)) return data;
	return { ...data, pages: [{ ...firstPage, items: [message, ...firstPage.items] }, ...restPages] };
}

function patchMessageInCache(data: InfiniteData<TChatMessagesPage> | undefined, messageId: string, patch: Partial<TChatThreadMessage>) {
	if (!data?.pages.length) return data;
	return {
		...data,
		pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === messageId ? { ...item, ...patch } : item)) })),
	};
}

/** O `chat` vive em todas as páginas; a thread lê o da primeira, mas o patch cobre todas por coerência. */
function patchChatInCache(data: InfiniteData<TChatMessagesPage> | undefined, patch: Partial<TChatMessagesPage["chat"]>) {
	if (!data?.pages.length) return data;
	return { ...data, pages: data.pages.map((page) => ({ ...page, chat: { ...page.chat, ...patch } })) };
}

function markChatReadInInboxCache(data: InfiniteData<TInboxPage> | undefined, chatId: string) {
	if (!data?.pages.length) return data;

	let changed = false;
	const pages = data.pages.map((page) => ({
		...page,
		items: page.items.map((item) => {
			if (item.id !== chatId || item.mensagensNaoLidas === 0) return item;
			changed = true;
			return { ...item, mensagensNaoLidas: 0 };
		}),
	}));

	return changed ? { ...data, pages } : data;
}

const CONTEXT_PANEL_STORAGE_KEY = "chat-context-panel-open";

/**
 * Coluna de contexto recolhível em telas largas, lembrada entre sessões: quem atende em notebook
 * prefere a conversa larga, quem tem monitor grande quer o contexto sempre à vista.
 *
 * Lido em efeito, não no inicializador: o servidor não tem localStorage e o primeiro render
 * precisa bater com o do cliente. Aberto por padrão — é o comportamento de antes.
 */
function useContextPanelPreference() {
	const [open, setOpen] = useState(true);
	useEffect(() => {
		try {
			if (window.localStorage.getItem(CONTEXT_PANEL_STORAGE_KEY) === "false") setOpen(false);
		} catch {
			// Storage indisponível: segue aberto.
		}
	}, []);
	const update = useCallback((next: boolean) => {
		setOpen(next);
		try {
			window.localStorage.setItem(CONTEXT_PANEL_STORAGE_KEY, String(next));
		} catch {
			// Modo privado / quota estourada: a preferência só não persiste.
		}
	}, []);
	return [open, update] as const;
}

/** Ponto da janela de 24h: verde quando aberta (é o que libera texto livre aqui), cor de alerta perto do fim. */
const WINDOW_DOT_CLASS = {
	aberta: "bg-success",
	gateway: "bg-muted-foreground/40",
	expirando: "bg-brand",
	expirada: "bg-destructive",
} as const;

function describeResponsible(atendimento: TChatAttendance, isOwner: boolean) {
	if (atendimento?.responsavelTipo === "USUARIO") {
		return { icon: UserRound, label: isOwner ? "Com você" : `Com ${atendimento.responsavelUsuario?.nome ?? "outro atendente"}` };
	}
	if (atendimento?.responsavelTipo === "AGENTE") return { icon: Sparkles, label: "Com a IA" };
	if (atendimento?.responsavelTipo === "EXTERNO") return { icon: Smartphone, label: "Atendido pelo telefone" };
	return { icon: UserRoundPlus, label: "Sem responsável" };
}

function formatDaySeparator(date: Date) {
	const today = new Date();
	const isToday = date.toDateString() === today.toDateString();
	if (isToday) return "Hoje";
	const yesterday = new Date(today.getTime() - 86_400_000);
	if (date.toDateString() === yesterday.toDateString()) return "Ontem";
	return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function ChatThread({ chatId, organizationId, currentUser, quotePermissions, onBack }: ChatThreadProps) {
	const queryClient = useQueryClient();
	const queryKey = getChatMessagesQueryKey(chatId);
	const { messages, chat, isPending, isError, error, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } = useChatMessages(chatId);

	const [optimisticMessages, setOptimisticMessages] = useState<TThreadMessage[]>([]);
	const [unseenCount, setUnseenCount] = useState(0);
	const [openRunId, setOpenRunId] = useState<string | null>(null);
	// A presença da IA depende do relógio ("responde em instantes" vira "ausente" quando a
	// previsão passa sem run). Um tique de 5s é o bastante e custa nada.
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 5000);
		return () => clearInterval(timer);
	}, []);
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputAreaRef = useRef<TChatInputAreaHandle>(null);
	const isAtBottomRef = useRef(true);
	const initialSubscriptionCompleteRef = useRef(false);
	const refetchRef = useRef(refetch);
	refetchRef.current = refetch;

	const atendimento = chat?.atendimentoAtivo ?? null;
	const isOwner = atendimento?.responsavelTipo === "USUARIO" && atendimento.responsavelUsuarioId === currentUser.id;

	// Otimista + persistida: a reconciliação é por clienteMensagemId, gerado no cliente.
	const threadMessages = useMemo<TThreadMessage[]>(() => {
		const persistedClientIds = new Set(messages.map((message) => message.clienteMensagemId).filter(Boolean));
		const pendentes = optimisticMessages.filter((message) => !persistedClientIds.has(message.clienteMensagemId));
		return [...pendentes, ...messages];
	}, [messages, optimisticMessages]);

	const loadOlderRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const sentinel = loadOlderRef.current;
		if (!sentinel || !hasNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
			},
			{ root: scrollRef.current, rootMargin: "300px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const [contextPanelOpen, setContextPanelOpen] = useContextPanelPreference();
	const [contextSheetOpen, setContextSheetOpen] = useState(false);
	const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
	// Mesmo corte do `ActionToolbar`: a partir de lg a coluna da thread tem ≥ 640px e cabe a
	// faixa inteira de ações; abaixo disso ela divide o espaço com o nome do cliente.
	const isWideHeader = useMediaQuery("(min-width: 1024px)");

	const markRead = useMutation({
		mutationFn: markChatRead,
		onMutate: ({ chatId: readChatId }) => {
			// A thread e a inbox são caches independentes. Zerar apenas a thread deixava
			// o badge lateral dependente do eco do Realtime para a mesma aba.
			queryClient.setQueriesData<InfiniteData<TInboxPage>>({ queryKey: ["chats"] }, (current) => markChatReadInInboxCache(current, readChatId));
		},
		onError: () => {
			// Se a persistência falhar, recarregamos a fonte de verdade e restauramos o badge.
			void queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
	});
	const markReadRef = useRef(markRead);
	markReadRef.current = markRead;

	const newestMessageId = threadMessages[0]?.id ?? null;
	useEffect(() => {
		if (!newestMessageId) return;
		if (isAtBottomRef.current) {
			setUnseenCount(0);
			return;
		}
		setUnseenCount((current) => current + 1);
	}, [newestMessageId]);

	// A aba que escreve não recebe eco do próprio write, então a leitura é marcada aqui.
	useEffect(() => {
		if (!chatId || !messages.length) return;
		markReadRef.current.mutate({ chatId });
		queryClient.setQueryData<InfiniteData<TChatMessagesPage>>(queryKey, (current) =>
			current ? { ...current, pages: current.pages.map((page) => ({ ...page, chat: { ...page.chat, mensagensNaoLidas: 0 } })) } : current,
		);
		// biome-ignore lint/correctness/useExhaustiveDependencies: só o id da mais recente importa
	}, [chatId, newestMessageId]);

	useEffect(() => {
		const channel = supabaseClient
			.channel(`chat-thread-${chatId}`)
			.on("postgres_changes", { event: "INSERT", schema: "public", table: "ampmais_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
				const message = mapRealtimeMessageRow(payload.new as TRealtimeChatMessageRow, currentUser);
				if (message.clienteMensagemId) {
					setOptimisticMessages((current) => current.filter((item) => item.clienteMensagemId !== message.clienteMensagemId));
				}
				queryClient.setQueryData<InfiniteData<TChatMessagesPage>>(queryKey, (current) => insertMessageIntoCache(current, message));
				// O realtime não traz o join de autor: para mensagens de terceiros o nome só
				// aparece depois de um refetch.
				if (message.autorTipo !== "CLIENTE" && message.autorUsuario?.id !== currentUser.id) void refetchRef.current();
				// Um orçamento criado pelo agente sempre vem acompanhado de mensagem, então a própria
				// thread serve de sinal — sem abrir um canal de realtime em `sales`. Invalidação por
				// prefixo: só uma conversa está aberta por vez, e assim o `clienteId` não precisa
				// entrar nas dependências desta inscrição.
				if (message.autorTipo !== "CLIENTE") void queryClient.invalidateQueries({ queryKey: ["client-open-quotes"] });
				if (message.autorTipo === "CLIENTE") markReadRef.current.mutate({ chatId });
			})
			.on("postgres_changes", { event: "UPDATE", schema: "public", table: "ampmais_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
				const row = payload.new as TRealtimeChatMessageRow;
				queryClient.setQueryData<InfiniteData<TChatMessagesPage>>(queryKey, (current) =>
					patchMessageInCache(current, row.id, {
						statusEntrega: row.status_entrega,
						whatsappMessageId: row.whatsapp_message_id,
						conteudoMidiaTextoProcessado: row.conteudo_midia_texto_processado,
						// Reações anexam na mensagem-alvo via UPDATE de metadados: sem este campo
						// no patch, o emoji só apareceria num refetch.
						metadados: row.metadados ?? null,
					}),
				);
			})
			.on("postgres_changes", { event: "*", schema: "public", table: "ampmais_chat_assignments", filter: `chat_id=eq.${chatId}` }, () => {
				void refetchRef.current();
			})
			.on("postgres_changes", { event: "UPDATE", schema: "public", table: "ampmais_chats", filter: `id=eq.${chatId}` }, () => {
				void refetchRef.current();
			})
			// Presença da IA: a linha da run traz status, erro e datas — tudo que `resolveAiPresence`
			// precisa — então é patch no cache, sem refetch. O histórico no painel é invalidado.
			.on("postgres_changes", { event: "*", schema: "public", table: "ampmais_ai_agent_runs", filter: `chat_id=eq.${chatId}` }, (payload) => {
				const row = payload.new as TRealtimeAiRunRow | undefined;
				if (!row?.id) return;
				const aiRun = mapRealtimeAiRunRow(row);
				queryClient.setQueryData<InfiniteData<TChatMessagesPage>>(queryKey, (current) => {
					// Só a run mais recente importa; uma atualização tardia de run antiga não regride o estado.
					const atual = current?.pages[0]?.chat.aiRun;
					if (atual && atual.id !== aiRun.id && new Date(atual.dataInsercao) > aiRun.dataInsercao) return current;
					return patchChatInCache(current, { aiRun });
				});
				void queryClient.invalidateQueries({ queryKey: [AI_AGENT_RUNS_QUERY_KEY_ROOT] });
			})
			.subscribe((status) => {
				if (status !== "SUBSCRIBED") return;
				if (!initialSubscriptionCompleteRef.current) {
					initialSubscriptionCompleteRef.current = true;
					return;
				}
				void refetchRef.current();
			});

		return () => {
			initialSubscriptionCompleteRef.current = false;
			void supabaseClient.removeChannel(channel);
		};
	}, [chatId, currentUser, queryClient, queryKey]);

	const sendMutation = useMutation({
		mutationFn: sendChatMessage,
		onSuccess: (data) => {
			setOptimisticMessages((current) => current.filter((item) => item.clienteMensagemId !== data.data.clienteMensagemId));
			queryClient.setQueryData<InfiniteData<TChatMessagesPage>>(queryKey, (current) => insertMessageIntoCache(current, data.data));
			void queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
		onError: (error, variables) => {
			setOptimisticMessages((current) =>
				current.map((item) => (item.clienteMensagemId === variables.clienteMensagemId ? { ...item, statusEntrega: "FALHA" as const } : item)),
			);
			toast.error(getErrorMessage(error));
		},
	});

	const retryMutation = useMutation({
		mutationFn: retryChatMessage,
		onSuccess: () => void refetch(),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const assumeMutation = useMutation({
		mutationFn: updateChatAssignment,
		onSuccess: (data) => {
			toast.success(data.message);
			void refetch();
			void queryClient.invalidateQueries({ queryKey: ["chats"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const handleSend = useCallback(
		(input: { texto: string; assinaturaAtiva: boolean; midia: TOutgoingAttachment | null }) => {
			const clienteMensagemId = crypto.randomUUID();
			setOptimisticMessages((current) => [
				{
					id: `optimistic-${clienteMensagemId}`,
					chatId,
					autorTipo: "USUÁRIO",
					autorUsuario: currentUser,
					autorCliente: null,
					conteudoTexto: input.texto || null,
					conteudoMidiaTipo: input.midia?.tipo ?? "TEXTO",
					conteudoMidiaUrl: null,
					conteudoMidiaMimeType: input.midia?.mimeType ?? null,
					conteudoMidiaArquivoNome: input.midia?.arquivoNome ?? null,
					conteudoMidiaArquivoTamanho: null,
					conteudoMidiaTextoProcessado: null,
					conteudoMidiaTextoProcessadoResumo: null,
					statusEntrega: "PENDENTE",
					provedorStatusDataAtualizacao: null,
					dataEnvio: new Date(),
					whatsappMessageId: null,
					whatsappEcho: false,
					clienteMensagemId,
					metadados: null,
					optimistic: true,
				},
				...current,
			]);
			sendMutation.mutate({
				chatId,
				clienteMensagemId,
				texto: input.texto || null,
				assinaturaAtiva: input.assinaturaAtiva,
				midia: input.midia,
			});
		},
		[chatId, currentUser, sendMutation],
	);

	if (isPending) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!chat) return <ErrorComponent msg="Chat não encontrado." />;

	const janela = getWhatsappWindowDisplay({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.conexaoTipo });
	const { icon: ResponsibleIcon, label: responsibleLabel } = describeResponsible(atendimento, isOwner);
	const aiPresence = resolveAiPresence({
		atendimento,
		atendimentoIa: { disponivel: chat.atendimentoIa.disponivel, motivo: chat.atendimentoIa.motivo },
		ultimaEntradaEm: chat.ultimaMensagemEntradaData,
		ultimaSaidaEm: chat.ultimaMensagemSaidaData,
		capacidades: chat.aiCapacidades,
		run: chat.aiRun,
		now,
	});
	// Quem acabou de receber a conversa (handoff da IA ou de um colega) precisa do resumo aberto.
	const summaryOpenByDefault = !!atendimento?.transferenciaMotivo && isOwner;

	/**
	 * Inserir o orçamento na conversa só faz sentido quando a conversa aceita texto livre agora: sem
	 * posse do atendimento não há o que enviar, e com a janela de 24h expirada só sai template
	 * aprovado. Fora dessas condições o orçamento continua registrado, apenas não é oferecido o
	 * atalho de escrever a mensagem.
	 */
	const canWriteInConversation = isOwner && janela.variant !== "expirada";
	const insertQuoteInConversation = canWriteInConversation ? (texto: string) => inputAreaRef.current?.appendText(texto) : undefined;
	// Sem cliente vinculado não há a quem orçar: a mesma regra que esconde o recurso no header largo.
	const canCreateQuote = !!chat.clienteId && quotePermissions.criar;

	return (
		<div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="flex shrink-0 flex-col gap-0.5 border-b border-border px-4 py-2">
					<div className="flex items-center gap-2">
						{/* No celular a lista some quando a conversa abre (ChatHub): sem este botão não há
						    caminho de volta — a aba "Hub" já está selecionada e não faz nada. */}
						{onBack && (
							<Button variant="ghost" size="icon-sm" className="-ml-2 shrink-0 md:hidden" aria-label="Voltar para a lista de conversas" onClick={onBack}>
								<ArrowLeft className="h-4 w-4" />
							</Button>
						)}
						<h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{chat.cliente?.nome ?? "Cliente sem nome"}</h2>
						{/* Tudo na faixa de ações usa a mesma altura (h-8): botões, chip de orçamento e ícones.
						    Abaixo de lg a faixa segue o `ActionToolbar` das páginas: fica o verbo de posse e
						    o resto vai para um menu de overflow, em vez de quebrar linha ou engolir o nome. */}
						<div className="flex shrink-0 items-center gap-1.5">
							{/* Orçamento em aberto é pendência comercial: aparece no header, que é a única
							    faixa sempre visível da thread. */}
							<ChatQuotesHeaderActions
								chatId={chatId}
								clientId={chat.clienteId}
								clientName={chat.cliente?.nome ?? "este cliente"}
								permissions={quotePermissions}
								onInsertInConversation={insertQuoteInConversation}
								builderOpen={quoteBuilderOpen}
								onBuilderOpenChange={setQuoteBuilderOpen}
								showNewQuoteButton={isWideHeader}
							/>

							{/* Header carrega só posse e roteamento; status e prioridade vivem no painel. */}
							<ChatAssignmentActions
								chatId={chatId}
								atendimento={atendimento}
								atendimentoIa={chat.atendimentoIa}
								currentUserId={currentUser.id}
								compact
								collapsed={!isWideHeader}
								overflowItems={
									<>
										{canCreateQuote && (
											<DropdownMenuItem onClick={() => setQuoteBuilderOpen(true)}>
												<Plus className="h-4 w-4" />
												Novo orçamento
											</DropdownMenuItem>
										)}
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => setContextSheetOpen(true)}>
											<PanelRightOpen className="h-4 w-4" />
											Contexto do atendimento
										</DropdownMenuItem>
									</>
								}
							/>

							{isWideHeader && (
								<Button
									variant="ghost"
									size="icon-sm"
									className="hidden shrink-0 xl:inline-flex"
									aria-label={contextPanelOpen ? "Ocultar contexto do atendimento" : "Mostrar contexto do atendimento"}
									aria-pressed={contextPanelOpen}
									onClick={() => setContextPanelOpen(!contextPanelOpen)}
								>
									{contextPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
								</Button>
							)}

							{/* Abaixo de xl o painel não cabe como coluna; vira gaveta sob demanda. Controlada
							    porque no header estreito quem a abre é um item do menu de overflow. */}
							<Sheet open={contextSheetOpen} onOpenChange={setContextSheetOpen}>
								{isWideHeader && (
									<SheetTrigger
										render={
											<Button variant="ghost" size="icon-sm" className="shrink-0 xl:hidden" aria-label="Abrir contexto do atendimento">
												<PanelRightOpen className="h-4 w-4" />
											</Button>
										}
									/>
								)}
								<SheetContent side="right" className="w-[min(22rem,90vw)] p-0">
									<SheetTitle className="sr-only">Contexto do atendimento</SheetTitle>
									<ChatContextPanel
										chatId={chatId}
										chat={chat}
										currentUserId={currentUser.id}
										quotePermissions={quotePermissions}
										onInsertQuoteInConversation={insertQuoteInConversation}
									/>
								</SheetContent>
							</Sheet>
						</div>
					</div>

					{/* Metadados numa linha só: telefone, janela e quem responde. O responsável sai dos
					    botões (que ficam só com o verbo) e vem para cá. */}
					<p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
						{chat.cliente?.telefone && <span className="tabular-nums">{chat.cliente.telefone}</span>}
						{chat.cliente?.telefone && <span aria-hidden>·</span>}
						<span
							className={cn(
								"flex items-center gap-1",
								janela.variant === "expirada" ? "text-destructive" : janela.variant === "expirando" ? "text-brand" : undefined,
							)}
						>
							<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", WINDOW_DOT_CLASS[janela.variant])} aria-hidden />
							{janela.label}
						</span>
						<span aria-hidden>·</span>
						<span className="flex min-w-0 items-center gap-1">
							<ResponsibleIcon className="h-3 w-3 shrink-0" aria-hidden />
							<span className={cn("truncate", isOwner && "font-medium text-foreground")}>{responsibleLabel}</span>
						</span>
					</p>
				</header>

				<AttendanceSummaryCard resumo={atendimento?.resumo} transferenciaMotivo={atendimento?.transferenciaMotivo} defaultOpen={summaryOpenByDefault} />

				<div
					ref={scrollRef}
					onScroll={(event) => {
						const element = event.currentTarget;
						// flex-col-reverse: o "fundo" (mensagem mais nova) é scrollTop === 0.
						isAtBottomRef.current = element.scrollTop > -40;
						if (isAtBottomRef.current) setUnseenCount(0);
					}}
					className="relative flex flex-1 flex-col-reverse gap-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-foreground/15 px-4 py-3"
				>
					{threadMessages.map((message, index) => {
						const anterior = threadMessages[index + 1];
						const currentDate = new Date(message.dataEnvio);
						const showDaySeparator = !anterior || new Date(anterior.dataEnvio).toDateString() !== currentDate.toDateString();
						const showAuthor = showDaySeparator || anterior.autorTipo !== message.autorTipo;

						return (
							// Respiro maior entre turnos do que dentro de um turno: a troca de autor fica
							// legível sem depender só do rótulo.
							<div key={message.clientTempId ?? message.id} className={cn("flex flex-col gap-1", showAuthor && !showDaySeparator && "pt-2")}>
								{/* O separador abre o dia: vem antes da primeira mensagem dele. */}
								{showDaySeparator && (
									<div className="my-2 flex items-center gap-2">
										<span className="h-px flex-1 bg-border" />
										<span className="text-[11px] uppercase tracking-wide text-muted-foreground">{formatDaySeparator(currentDate)}</span>
										<span className="h-px flex-1 bg-border" />
									</div>
								)}
								<ChatMessageBubble
									message={message}
									showAuthor={showAuthor}
									onRetry={(messageId) => retryMutation.mutate({ messageId })}
									isRetrying={retryMutation.isPending}
									onOpenAiRun={setOpenRunId}
								/>
							</div>
						);
					})}

					{/* Sentinela no topo visual (fim do DOM, por causa do flex-col-reverse): rolar para
				    cima carrega o histórico sozinho. No col-reverse o scrollTop é medido a partir do
				    fundo, então as mensagens antigas entram acima sem deslocar o que está na tela. */}
					{hasNextPage && (
						<div ref={loadOlderRef} className="flex justify-center py-2 text-[11px] text-muted-foreground">
							{isFetchingNextPage ? (
								<span className="flex items-center gap-1.5">
									<Loader2 className="h-3 w-3 animate-spin" />
									Carregando mensagens anteriores
								</span>
							) : (
								<span className="h-3" />
							)}
						</div>
					)}
				</div>

				<div aria-live="polite" className="sr-only">
					{unseenCount > 0 ? `${unseenCount} ${unseenCount === 1 ? "nova mensagem" : "novas mensagens"}` : ""}
				</div>
				{unseenCount > 0 && (
					<button
						type="button"
						onClick={() => {
							scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
							setUnseenCount(0);
						}}
						className="mx-auto -mt-8 mb-2 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<ChevronDown className="h-3 w-3" />
						{unseenCount} {unseenCount === 1 ? "nova" : "novas"}
					</button>
				)}

				<AiPresenceBar
					presence={aiPresence}
					agentName={chat.atendimentoIa.agenteNome}
					onAssume={isOwner ? undefined : () => assumeMutation.mutate({ acao: "assumir", chatId })}
					isAssuming={assumeMutation.isPending}
					onOpenRun={setOpenRunId}
				/>

				<ChatInputArea
					ref={inputAreaRef}
					organizationId={organizationId}
					userName={currentUser.nome}
					isOwner={!!isOwner}
					janelaExpiracao={chat.whatsappJanelaDataExpiracao}
					conexaoTipo={chat.conexaoTipo}
					isSending={sendMutation.isPending}
					onSend={handleSend}
					onAssume={() => assumeMutation.mutate({ acao: "assumir", chatId })}
					templates={[]}
					onSendTemplate={(messageTemplateId) => sendMutation.mutate({ chatId, messageTemplateId, assinaturaAtiva: false })}
				/>
			</div>

			{openRunId ? <AgentRunDrawer runId={openRunId} closeModal={() => setOpenRunId(null)} /> : null}

			<aside className={cn("hidden min-h-0 w-80 shrink-0 overflow-hidden border-l border-border", contextPanelOpen && "xl:block")}>
				<ChatContextPanel
					chatId={chatId}
					chat={chat}
					currentUserId={currentUser.id}
					quotePermissions={quotePermissions}
					onInsertQuoteInConversation={insertQuoteInConversation}
				/>
			</aside>
		</div>
	);
}

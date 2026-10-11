"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS,
	CHAT_BOARD_STATUSES,
	canCancelChatBoardAttendance,
	chatBoardTransitionNeedsConfirmation,
	isValidChatBoardTransition,
} from "@/lib/chats/board";
import { getErrorMessage } from "@/lib/errors";
import { updateChatAssignment } from "@/lib/mutations/chats";
import { useChatsBoard, type TChatBoardCard, type TChatBoardData, type TChatBoardFilters } from "@/lib/queries/chats-board";
import { cn } from "@/lib/utils";
import type { TChatAssignmentPriority, TChatAssignmentStatus } from "@/schemas/enums";
import { createRealtimeChannel, supabaseClient } from "@/services/supabase";
import {
	closestCorners,
	DndContext,
	DragOverlay,
	PointerSensor,
	useSensor,
	useSensors,
	type Announcements,
	type DragEndEvent,
	type DragStartEvent,
	type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatsBoardCard } from "./ChatsBoardCard";
import { ChatsBoardColumn } from "./ChatsBoardColumn";
import { ChatsBoardFilters } from "./ChatsBoardFilters";
import { CHAT_ASSIGNMENT_STATUS_LABEL, CHAT_BOARD_COLUMN_META, CHAT_PRIORITY_LABEL } from "./config";

const BOARD_SCROLL_CLASS = "scrollbar-subtle";
const BOARD_DESKTOP_MAX_HEIGHT = "md:max-h-[calc(100dvh-14rem)] md:overflow-hidden";

const INITIAL_FILTERS: TChatBoardFilters = {
	view: "TODAS",
	whatsappConexaoTelefoneId: null,
	prioridade: null,
	search: "",
	encerradosDias: CHAT_BOARD_CLOSED_WINDOW_DEFAULT_DAYS,
};

const screenReaderInstructions: ScreenReaderInstructions = {
	draggable: "Para mover um atendimento pelo teclado, use o botão de ações em cada card e escolha o estado de destino.",
};

type PendingConfirm = { card: TChatBoardCard; target: TChatAssignmentStatus; previousStatus: TChatAssignmentStatus };

type ChatsBoardProps = {
	organizationId: string;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	onOpenChat: (chatId: string) => void;
};

export default function ChatsBoard({ organizationId, whatsappConnections, onOpenChat }: ChatsBoardProps) {
	const [filters, setFilters] = useState<TChatBoardFilters>(INITIAL_FILTERS);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(new Set());
	const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
	const queryClient = useQueryClient();

	// Um refetch no meio de um movimento otimista devolveria o card à coluna de origem.
	const paused = pendingCardIds.size > 0 || confirm !== null;
	const { data, isPending, isError, error, refetch, isRefetching, queryKey } = useChatsBoard({ filters, paused });

	// O canal de realtime lê a pausa por ref: colocá-la nas dependências do efeito
	// derrubaria e recriaria a inscrição a cada card em voo — e eventos se perdem na troca.
	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	const updateFilters = useCallback((patch: Partial<TChatBoardFilters>) => {
		setFilters((current) => ({ ...current, ...patch }));
	}, []);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	const cards = useMemo(() => (data?.colunas ?? []).flatMap((coluna) => coluna.itens), [data]);
	const activeCard = activeId ? (cards.find((card) => card.id === activeId) ?? null) : null;

	// Qualquer mudança em `chat_assignments` move um card de coluna, cria ou encerra um
	// atendimento. Diferente da inbox, aqui não há patch cirúrgico que valha a pena: a
	// posição do card depende do status e o total da coluna vem do servidor.
	useEffect(() => {
		// Nome único por inscrição: ver `createRealtimeChannel`.
		const channel = createRealtimeChannel(`chats-board-${organizationId}`)
			.on("postgres_changes", { event: "*", schema: "public", table: "ampmais_chat_assignments", filter: `organizacao_id=eq.${organizationId}` }, () => {
				// Enquanto há movimento em voo, o cache local é a verdade — invalidar aqui
				// competiria com o otimismo e faria o card piscar entre as colunas.
				if (pausedRef.current) return;
				void queryClient.invalidateQueries({ queryKey: ["chats-board"] });
			})
			.subscribe();

		return () => {
			void supabaseClient.removeChannel(channel);
		};
	}, [organizationId, queryClient]);

	/**
	 * Move o card entre colunas no cache, mantendo os totais coerentes com o que se vê.
	 *
	 * `CANCELADO` não tem coluna: nenhum destino casa, o card some do quadro e o total da
	 * origem cai. É exatamente o efeito desejado — cancelar tira o atendimento do fluxo.
	 */
	const setCardStatus = useCallback(
		(cardId: string, target: TChatAssignmentStatus) => {
			queryClient.setQueryData<TChatBoardData>(queryKey, (old) => {
				if (!old) return old;
				const moved = old.colunas.flatMap((coluna) => coluna.itens).find((item) => item.id === cardId);
				if (!moved) return old;

				return {
					...old,
					colunas: old.colunas.map((coluna) => {
						const semCard = coluna.itens.filter((item) => item.id !== cardId);
						const perdeu = semCard.length !== coluna.itens.length;

						if (coluna.status === target) {
							return {
								...coluna,
								itens: [{ ...moved, status: target }, ...semCard],
								total: coluna.total + (perdeu ? 0 : 1),
							};
						}
						return { ...coluna, itens: semCard, total: coluna.total - (perdeu ? 1 : 0) };
					}),
				};
			});
		},
		[queryClient, queryKey],
	);

	const commitMove = useCallback(
		async (card: TChatBoardCard, target: TChatAssignmentStatus, previousStatus: TChatAssignmentStatus) => {
			setPendingCardIds((prev) => new Set(prev).add(card.id));
			try {
				await updateChatAssignment({ acao: "alterar_status", chatId: card.chatId, status: target });
				toast.success(`Atendimento movido para ${CHAT_ASSIGNMENT_STATUS_LABEL[target]}.`);
				await queryClient.invalidateQueries({ queryKey: ["chats-board"] });
				// A inbox mostra o mesmo atendimento no rodapé de cada conversa.
				void queryClient.invalidateQueries({ queryKey: ["chats"] });
			} catch (err) {
				// Inclui o 403 de quem não é responsável nem gestor: a rota é a autoridade.
				setCardStatus(card.id, previousStatus);
				toast.error(getErrorMessage(err));
			} finally {
				setPendingCardIds((prev) => {
					const next = new Set(prev);
					next.delete(card.id);
					return next;
				});
			}
		},
		[queryClient, setCardStatus],
	);

	const initiateMove = useCallback(
		(card: TChatBoardCard, target: TChatAssignmentStatus) => {
			if (pendingCardIds.has(card.id) || confirm?.card.id === card.id) return;
			if (target === card.status) return;

			const permitido = target === "CANCELADO" ? canCancelChatBoardAttendance(card.status) : isValidChatBoardTransition(card.status, target);
			if (!permitido) {
				toast.info(
					card.status === "ENCERRADO"
						? "Atendimentos encerrados não voltam ao quadro. Uma nova mensagem do cliente abre um atendimento novo."
						: `Não é possível mover de ${CHAT_ASSIGNMENT_STATUS_LABEL[card.status]} para ${CHAT_ASSIGNMENT_STATUS_LABEL[target]}.`,
				);
				return;
			}

			const previousStatus = card.status;
			setCardStatus(card.id, target);
			if (chatBoardTransitionNeedsConfirmation(target)) {
				setConfirm({ card, target, previousStatus });
			} else {
				void commitMove(card, target, previousStatus);
			}
		},
		[commitMove, confirm, pendingCardIds, setCardStatus],
	);

	const changePriority = useCallback(
		async (card: TChatBoardCard, prioridade: TChatAssignmentPriority | null) => {
			setPendingCardIds((prev) => new Set(prev).add(card.id));
			try {
				await updateChatAssignment({ acao: "alterar_prioridade", chatId: card.chatId, prioridade });
				toast.success(prioridade ? `Prioridade alterada para ${CHAT_PRIORITY_LABEL[prioridade]}.` : "Prioridade removida.");
				await queryClient.invalidateQueries({ queryKey: ["chats-board"] });
			} catch (err) {
				toast.error(getErrorMessage(err));
			} finally {
				setPendingCardIds((prev) => {
					const next = new Set(prev);
					next.delete(card.id);
					return next;
				});
			}
		},
		[queryClient],
	);

	const announcements: Announcements = {
		onDragStart: ({ active }) => {
			const card = cards.find((item) => item.id === String(active.id));
			return `Pegou o atendimento de ${card?.cliente?.nome ?? "cliente sem nome"}.`;
		},
		onDragOver: ({ over }) => {
			if (!over) return undefined;
			return `Sobre a etapa ${CHAT_BOARD_COLUMN_META[over.id as keyof typeof CHAT_BOARD_COLUMN_META]?.label ?? String(over.id)}.`;
		},
		onDragEnd: ({ over }) => {
			if (!over) return "Movimento cancelado.";
			return `Atendimento solto na etapa ${CHAT_BOARD_COLUMN_META[over.id as keyof typeof CHAT_BOARD_COLUMN_META]?.label ?? String(over.id)}.`;
		},
		onDragCancel: () => "Movimento cancelado.",
	};

	function handleDragEnd(event: DragEndEvent) {
		setActiveId(null);
		const { active, over } = event;
		if (!over) return;
		const card = cards.find((item) => item.id === String(active.id));
		if (!card) return;
		initiateMove(card, String(over.id) as TChatAssignmentStatus);
	}

	function handleConfirm() {
		if (!confirm) return;
		const { card, target, previousStatus } = confirm;
		setConfirm(null);
		void commitMove(card, target, previousStatus);
	}

	function handleCancelConfirm() {
		if (confirm) setCardStatus(confirm.card.id, confirm.previousStatus);
		setConfirm(null);
	}

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	const callbacks = { onOpenChat, onMove: initiateMove, onChangePriority: changePriority };

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col gap-3", BOARD_DESKTOP_MAX_HEIGHT)}>
			<ChatsBoardFilters filters={filters} onChange={updateFilters} whatsappConnections={whatsappConnections} />

			<div className="flex shrink-0 items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">
					{isPending
						? "Carregando atendimentos..."
						: `${data?.totais.abertos ?? 0} em aberto · ${data?.totais.naFila ?? 0} na fila · ${data?.totais.pendentes ?? 0} aguardando resposta`}
				</p>
				<Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching} aria-label="Atualizar quadro">
					<RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
				</Button>
			</div>

			{isPending ? (
				<div className={cn(BOARD_SCROLL_CLASS, "flex min-h-[50vh] flex-1 gap-3 overflow-x-auto pb-2 md:min-h-0 md:overflow-y-hidden")}>
					{CHAT_BOARD_STATUSES.map((status) => (
						<div key={status} className="flex h-full w-[300px] min-w-[300px] flex-col gap-2">
							<Skeleton className="h-5 w-32 shrink-0" />
							<Skeleton className="h-full min-h-24 w-full rounded-xl" />
						</div>
					))}
				</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCorners}
					accessibility={{ announcements, screenReaderInstructions }}
					onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
					onDragEnd={handleDragEnd}
					onDragCancel={() => setActiveId(null)}
				>
					<div className={cn(BOARD_SCROLL_CLASS, "flex min-h-[50vh] flex-1 snap-x gap-3 overflow-x-auto pb-2 md:min-h-0 md:overflow-y-hidden")}>
						{(data?.colunas ?? []).map((coluna) => (
							<ChatsBoardColumn
								key={coluna.status}
								status={coluna.status}
								itens={coluna.itens}
								total={coluna.total}
								pendingCardIds={pendingCardIds}
								confirmCardId={confirm?.card.id ?? null}
								callbacks={callbacks}
							/>
						))}
					</div>

					{/* Sem `onOpen`/`onMove`, o card do overlay não renderiza alça nem menu — é retrato puro. */}
					<DragOverlay dropAnimation={null}>{activeCard ? <ChatsBoardCard card={activeCard} isOverlay /> : null}</DragOverlay>
				</DndContext>
			)}

			<Dialog open={confirm !== null} onOpenChange={(open) => !open && handleCancelConfirm()}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{confirm?.target === "CANCELADO" ? "Cancelar atendimento?" : "Encerrar atendimento?"}</DialogTitle>
						<DialogDescription>
							{confirm?.target === "CANCELADO"
								? "O atendimento sai do quadro. Uma nova mensagem do cliente abre um atendimento novo, do zero."
								: "O atendimento sai do fluxo e passa a aparecer só na coluna de encerrados, dentro da janela escolhida. Não é possível trazê-lo de volta pelo quadro."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelConfirm}>
							VOLTAR
						</Button>
						<Button variant={confirm?.target === "CANCELADO" ? "destructive" : "default"} onClick={handleConfirm}>
							{confirm?.target === "CANCELADO" ? "CANCELAR ATENDIMENTO" : "ENCERRAR"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

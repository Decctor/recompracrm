"use client";

import type { TGetSalesFulfillmentOutputDefault, TPatchSalesFulfillmentInput, TSalesFulfillmentCard } from "@/app/api/sales/fulfillment/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { patchSalesFulfillment, updateSaleAttendanceStatus } from "@/lib/mutations/sales";
import { SALES_FULFILLMENT_QUERY_KEY, useSalesFulfillment } from "@/lib/queries/sales-fulfillment";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { isValidAttendanceTransition } from "@/lib/sales/sale-processing/attendance";
import { cn } from "@/lib/utils";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	closestCorners,
	pointerWithin,
	useSensor,
	useSensors,
	type CollisionDetection,
	type Announcements,
	type DragEndEvent,
	type DragStartEvent,
	type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	ATTENDANCE_COLUMN_META,
	ATTENDANCE_STATUS_LABEL,
	BOARD_COLUMN_WIDTH_PX,
	BOARD_RAIL_WIDTH_PX,
	DELIVERED_STATUS,
	PIPELINE_STATUSES,
	type TBoardStatus,
	type TPipelineStatus,
	transitionNeedsConfirmation,
} from "./config";
import { DeliveredBuffer } from "./delivered-buffer";
import { FulfillmentCard } from "./fulfillment-card";
import { FulfillmentColumn } from "./fulfillment-column";
import { PendingConfirmationPill } from "./pending-confirmation";
import { PendingDisputesPill } from "./pending-disputes";
import { StageTransitionConfirmationMenu } from "./stage-transition-confirmation-menu";
import { useFulfillmentBoardCompaction } from "./use-fulfillment-board-compaction";

const KANBAN_SCROLL_CLASS = "scrollbar-subtle";
const BOARD_DESKTOP_MAX_HEIGHT = "md:max-h-[calc(100dvh-10.5rem)] md:overflow-hidden";

type FulfillmentData = TGetSalesFulfillmentOutputDefault;

type PendingStageTransition = {
	cardId: string;
	previousStatus: TSaleAttendanceStatusEnum;
	targetStatus: TSaleAttendanceStatusEnum;
};

type FulfillmentBoardProps = {
	organizationId: string;
	organizationConfig: TOrganizationConfiguration;
	canEditSales?: boolean;
	onViewDetails: (saleId: string) => void;
};

/**
 * O ponteiro decide o destino; a geometria so entra como rede de seguranca.
 *
 * `closestCorners` sozinho mede os cantos do CARD arrastado (300px de largura) contra os cantos de
 * cada coluna. Com etapas recolhidas em trilhas de 44px, vizinhas a 56px uma da outra, a propria
 * largura do card domina a conta e a mira do operador quase nao pesa: duas trilhas lado a lado ficam
 * praticamente indistinguiveis e o quadro escolhe sempre a mesma. `pointerWithin` resolve pelo pixel
 * sob o cursor, entao a trilha mirada e a trilha escolhida. O fallback cobre o unico caso que o
 * ponteiro nao cobre: o cursor sobre um vao entre colunas.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

const screenReaderInstructions: ScreenReaderInstructions = {
	draggable: "Para mover um pedido pelo teclado, use o botão 'Mover pedido' em cada card e escolha a etapa de destino.",
};

export default function FulfillmentBoard({ organizationId, organizationConfig, canEditSales, onViewDetails }: FulfillmentBoardProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [pendingCardIds, setPendingCardIds] = useState<Set<string>>(new Set());
	const [pendingTransition, setPendingTransition] = useState<PendingStageTransition | null>(null);

	const paused = pendingCardIds.size > 0 || pendingTransition !== null;
	const { data, isLoading, isError, error, refetch, isRefetching } = useSalesFulfillment({ paused });
	const queryClient = useQueryClient();

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	const cards = useMemo(() => data?.cards ?? [], [data]);
	const grouped = useMemo(() => {
		const map = Object.fromEntries(PIPELINE_STATUSES.map((status) => [status, [] as TSalesFulfillmentCard[]])) as Record<
			TPipelineStatus,
			TSalesFulfillmentCard[]
		>;
		for (const card of cards) {
			if ((PIPELINE_STATUSES as readonly string[]).includes(card.statusAtendimento)) {
				map[card.statusAtendimento as TPipelineStatus].push(card);
			}
		}
		return map;
	}, [cards]);

	/**
	 * Um card concluido nesta sessao continua em `cards` (marcado ENTREGUE) ate o refetch chegar.
	 * Projeta-lo aqui e o que faz o pedido aparecer no comprovante no mesmo gesto, em vez de sumir do
	 * quadro e reaparecer segundos depois. O carimbo local mantem a linha honesta enquanto isso: o
	 * que esta sendo concluido agora le "agora", e some de novo se o operador cancelar.
	 */
	const delivered = useMemo(() => {
		const base = data?.delivered ?? { cards: [] as TSalesFulfillmentCard[], total: 0, windowHours: 2, limit: 15 };
		const settledAt = new Date();
		const optimistic = cards
			.filter((card) => card.statusAtendimento === DELIVERED_STATUS)
			.map((card) => ({ ...card, statusAtendimentoData: settledAt }));
		if (optimistic.length === 0) return base;
		const optimisticIds = new Set(optimistic.map((card) => card.id));
		const remaining = base.cards.filter((card) => !optimisticIds.has(card.id));
		// Os que o servidor ja contou nao podem ser contados de novo quando o refetch e a projecao
		// local se sobrepoem por um instante.
		const alreadyCounted = base.cards.length - remaining.length;
		return {
			...base,
			cards: [...optimistic, ...remaining].slice(0, base.limit),
			total: base.total + optimistic.length - alreadyCounted,
		};
	}, [cards, data]);

	const stageCounts = useMemo(
		() => Object.fromEntries(PIPELINE_STATUSES.map((status) => [status, grouped[status].length])) as Record<TPipelineStatus, number>,
		[grouped],
	);

	// Unico sinal que sobrevive ao recolhimento. E ele que decide se da para confiar numa trilha
	// fechada: sem isso, recolher uma etapa seria uma forma silenciosa de perder um pedido em atraso.
	const stagesWithOverduePayment = useMemo(() => {
		const stages = new Set<TPipelineStatus>();
		for (const status of PIPELINE_STATUSES) {
			if (grouped[status].some((card) => card.financeiro === "EM_ATRASO")) stages.add(status);
		}
		return stages;
	}, [grouped]);

	// No mobile o quadro ja mostra uma etapa por vez via snap-scroll, entao recolher nao libera
	// espaco nenhum e as trilhas so atrapalhariam os alvos de swipe entre os pontos de encaixe.
	const canCompact = useMediaQuery("(min-width: 768px)");

	const { collapsedByStage, setStageCollapsed, focusStage, allCollapsed } = useFulfillmentBoardCompaction({
		organizationId,
		stageCounts,
		seedReady: !isLoading && data != null,
		enabled: canCompact,
	});

	const activeCard = activeId ? (cards.find((card) => card.id === activeId) ?? null) : null;
	const pendingTransitionCard = pendingTransition ? (cards.find((card) => card.id === pendingTransition.cardId) ?? null) : null;

	function setCardStatus(cardId: string, target: TSaleAttendanceStatusEnum) {
		queryClient.setQueryData<FulfillmentData>(SALES_FULFILLMENT_QUERY_KEY, (old) =>
			old ? { ...old, cards: old.cards.map((card) => (card.id === cardId ? { ...card, statusAtendimento: target } : card)) } : old,
		);
	}

	function replaceCard(updatedCard: TSalesFulfillmentCard) {
		queryClient.setQueryData<FulfillmentData>(SALES_FULFILLMENT_QUERY_KEY, (old) =>
			old ? { ...old, cards: old.cards.map((card) => (card.id === updatedCard.id ? updatedCard : card)) } : old,
		);
	}

	const handlePatchCard = useCallback(
		async (input: TPatchSalesFulfillmentInput) => {
			const currentCard = cards.find((card) => card.id === input.id);
			if (!currentCard) return;

			setPendingCardIds((prev) => new Set(prev).add(input.id));

			if (input.entrega) {
				queryClient.setQueryData<FulfillmentData>(SALES_FULFILLMENT_QUERY_KEY, (old) =>
					old
						? {
								...old,
								cards: old.cards.map((card) =>
									card.id === input.id
										? {
												...card,
												entregaModalidade: input.entrega!.modalidade,
												comandaNumero: input.entrega!.modalidade === "COMANDA" ? (input.entrega!.comandaNumero ?? null) : null,
											}
										: card,
								),
							}
						: old,
				);
			}

			if (input.pagamento) {
				queryClient.setQueryData<FulfillmentData>(SALES_FULFILLMENT_QUERY_KEY, (old) =>
					old
						? {
								...old,
								cards: old.cards.map((card) =>
									card.id === input.id
										? {
												...card,
												pagamentos: card.pagamentos.map((payment) =>
													payment.id === input.pagamento!.transacaoId ? { ...payment, metodo: input.pagamento!.metodo } : payment,
												),
											}
										: card,
								),
							}
						: old,
				);
			}

			try {
				const result = await patchSalesFulfillment(input);
				const updatedCard =
					pendingTransition?.cardId === input.id ? { ...result.data.card, statusAtendimento: pendingTransition.targetStatus } : result.data.card;
				replaceCard(updatedCard);
				toast.success(result.message);
			} catch (err) {
				if (currentCard) replaceCard(currentCard);
				toast.error(getErrorMessage(err));
			} finally {
				setPendingCardIds((prev) => {
					const next = new Set(prev);
					next.delete(input.id);
					return next;
				});
			}
		},
		[cards, pendingTransition, queryClient],
	);

	async function commitMove(
		card: TSalesFulfillmentCard,
		target: TSaleAttendanceStatusEnum,
		previousStatus: TSaleAttendanceStatusEnum,
		options?: { settlePendingPayment?: boolean; allowUnpaidDelivery?: boolean },
	) {
		setPendingCardIds((prev) => new Set(prev).add(card.id));
		try {
			await updateSaleAttendanceStatus({
				id: card.id,
				attendanceStatus: target,
				settlePendingPayment: options?.settlePendingPayment ?? false,
				allowUnpaidDelivery: options?.allowUnpaidDelivery ?? false,
			});
			toast.success(`Pedido movido para ${ATTENDANCE_STATUS_LABEL[target]}.`);
			await queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY });
		} catch (err) {
			setCardStatus(card.id, previousStatus);
			toast.error(getErrorMessage(err));
		} finally {
			setPendingCardIds((prev) => {
				const next = new Set(prev);
				next.delete(card.id);
				return next;
			});
		}
	}

	function initiateMove(card: TSalesFulfillmentCard, target: TSaleAttendanceStatusEnum) {
		if (pendingCardIds.has(card.id) || pendingTransition?.cardId === card.id) return;
		if (target === card.statusAtendimento) return;
		if (!isValidAttendanceTransition(card.statusAtendimento, target)) {
			toast.info(`Não é possível mover de ${ATTENDANCE_STATUS_LABEL[card.statusAtendimento]} para ${ATTENDANCE_STATUS_LABEL[target]}.`);
			return;
		}
		const previousStatus = card.statusAtendimento;
		setCardStatus(card.id, target);
		if (transitionNeedsConfirmation(target)) {
			setPendingTransition({ cardId: card.id, previousStatus, targetStatus: target });
		} else {
			void commitMove(card, target, previousStatus);
		}
	}

	const announcements: Announcements = {
		onDragStart: ({ active }) => {
			const card = cards.find((item) => item.id === String(active.id));
			return `Pegou o pedido de ${card?.cliente?.nome ?? card?.idExterno ?? "cliente"}.`;
		},
		onDragOver: ({ over }) => {
			if (!over) return undefined;
			const label = ATTENDANCE_COLUMN_META[String(over.id) as TBoardStatus]?.label ?? String(over.id);
			return `Sobre a etapa ${label}.`;
		},
		onDragEnd: ({ over }) => {
			if (!over) return "Movimento cancelado.";
			const label = ATTENDANCE_COLUMN_META[String(over.id) as TBoardStatus]?.label ?? String(over.id);
			return `Pedido solto na etapa ${label}.`;
		},
		onDragCancel: () => "Movimento cancelado.",
	};

	function handleDragStart(event: DragStartEvent) {
		setActiveId(String(event.active.id));
	}

	function handleDragEnd(event: DragEndEvent) {
		setActiveId(null);
		const { active, over } = event;
		if (!over) return;
		const card = cards.find((item) => item.id === String(active.id));
		if (!card) return;
		initiateMove(card, String(over.id) as TSaleAttendanceStatusEnum);
	}

	async function handleConfirmDelivery(card: TSalesFulfillmentCard) {
		if (!pendingTransition) return;
		await commitMove(card, pendingTransition.targetStatus, pendingTransition.previousStatus, {
			settlePendingPayment: card.financeiro !== "RECEBIDA",
		});
		setPendingTransition(null);
	}

	async function handleDeliverWithoutPayment(card: TSalesFulfillmentCard) {
		if (!pendingTransition) return;
		await commitMove(card, pendingTransition.targetStatus, pendingTransition.previousStatus, { allowUnpaidDelivery: true });
		setPendingTransition(null);
	}

	function cancelPendingTransition() {
		if (pendingTransition) setCardStatus(pendingTransition.cardId, pendingTransition.previousStatus);
		setPendingTransition(null);
	}

	if (isLoading) {
		return (
			<div className={cn("flex min-h-0 flex-1 flex-col gap-3", BOARD_DESKTOP_MAX_HEIGHT)}>
				<Skeleton className="h-9 w-full max-w-md shrink-0" />
				<div className={cn(KANBAN_SCROLL_CLASS, "flex min-h-[50vh] flex-1 gap-3 overflow-x-auto pb-2 md:min-h-0 md:overflow-y-hidden")}>
					{PIPELINE_STATUSES.map((status) => (
						<div
							key={status}
							style={{ width: collapsedByStage[status] ? BOARD_RAIL_WIDTH_PX : BOARD_COLUMN_WIDTH_PX }}
							className="flex h-full shrink-0 flex-col gap-2"
						>
							<Skeleton className="h-5 w-full max-w-32 shrink-0" />
							<Skeleton className="h-full min-h-24 w-full rounded-xl" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col gap-3", BOARD_DESKTOP_MAX_HEIGHT)}>
			<div className="flex shrink-0 items-center justify-between gap-2">
				{/* Conta so as etapas do fluxo. Somar os concluidos aqui fazia o quadro anunciar 162
				    pedidos "em atendimento" quando havia um unico pedido em aberto. */}
				<p className="text-xs text-muted-foreground">
					{cards.length > 0 ? `${cards.length} pedido(s) em atendimento` : "Nenhum pedido em atendimento no momento"}
				</p>
				<div className="flex items-center gap-2">
					<PendingDisputesPill
						pending={data?.pendingDisputes ?? []}
						canManage
						onChanged={() => queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY })}
					/>
					<PendingConfirmationPill
						pending={data?.pendingConfirmation ?? []}
						canManage
						onChanged={() => queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY })}
					/>
					<Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching} aria-label="Atualizar">
						<RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
					</Button>
				</div>
			</div>

			{cards.length === 0 && delivered.cards.length === 0 ? (
				<div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border py-16 text-center md:min-h-0">
					<p className="text-sm font-bold tracking-tight">Nenhum pedido em atendimento</p>
					<p className="max-w-md text-xs text-muted-foreground">
						Pedidos confirmados aparecem aqui para você acompanhar o preparo e a entrega. Arraste um card para mover entre as etapas.
					</p>
				</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={boardCollisionDetection}
					accessibility={{ announcements, screenReaderInstructions }}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragCancel={() => setActiveId(null)}
				>
					<div className={cn(KANBAN_SCROLL_CLASS, "flex min-h-[50vh] flex-1 snap-x gap-3 overflow-x-auto pb-2 md:min-h-0 md:overflow-y-hidden")}>
						{PIPELINE_STATUSES.map((status) => (
							<FulfillmentColumn
								key={status}
								status={status}
								cards={grouped[status]}
								organizationConfig={organizationConfig}
								pendingCardIds={pendingCardIds}
								pendingTransitionCardId={pendingTransition?.cardId ?? null}
								isCollapsed={collapsedByStage[status]}
								hasOverduePayment={stagesWithOverduePayment.has(status)}
								canCompact={canCompact}
								onSetCollapsed={setStageCollapsed}
								onFocus={focusStage}
								onMove={initiateMove}
								onPatch={handlePatchCard}
								onViewDetails={onViewDetails}
								canEditSales={canEditSales}
							/>
						))}
						{allCollapsed ? (
							<div className="flex min-w-[220px] flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 px-4 text-center text-[11px] text-muted-foreground">
								Todas as etapas recolhidas. Clique em uma etapa para abrir.
							</div>
						) : (
							<div className="hidden flex-1 md:block" />
						)}
						<DeliveredBuffer delivered={delivered} onViewDetails={onViewDetails} />
					</div>

					<DragOverlay dropAnimation={null}>
						{activeCard ? <FulfillmentCard card={activeCard} organizationConfig={organizationConfig} isOverlay /> : null}
					</DragOverlay>
				</DndContext>
			)}

			{pendingTransitionCard ? (
				<StageTransitionConfirmationMenu
					card={pendingTransitionCard}
					organizationConfig={organizationConfig}
					isPending={pendingCardIds.has(pendingTransitionCard.id)}
					onPatch={handlePatchCard}
					onConfirm={() => void handleConfirmDelivery(pendingTransitionCard)}
					onConfirmWithoutPayment={() => void handleDeliverWithoutPayment(pendingTransitionCard)}
					onCancel={cancelPendingTransition}
				/>
			) : null}
		</div>
	);
}

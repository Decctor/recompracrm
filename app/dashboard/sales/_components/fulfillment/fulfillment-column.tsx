"use client";

import type { TPatchSalesFulfillmentInput, TSalesFulfillmentCard } from "@/app/api/sales/fulfillment/route";
import { cn } from "@/lib/utils";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { ATTENDANCE_COLUMN_META, BOARD_COLUMN_WIDTH_PX, BOARD_RAIL_ACTIVE_WIDTH_PX, BOARD_RAIL_WIDTH_PX, type TPipelineStatus } from "./config";
import { FulfillmentCard } from "./fulfillment-card";

// Curva ease-out-quart: sai rapido e assenta devagar, sem overshoot.
const COMPACTION_EASING = "cubic-bezier(0.22,1,0.36,1)";

const COUNT_BADGE_CLASS =
	"inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] font-bold tabular-nums text-secondary-foreground";

const HEADER_BUTTON_CLASS =
	"inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";

function DraggableCard({
	card,
	organizationConfig,
	isPending,
	awaitingConfirm,
	onMove,
	onPatch,
	onViewDetails,
	canEditSales,
}: {
	card: TSalesFulfillmentCard;
	organizationConfig: TOrganizationConfiguration;
	isPending: boolean;
	awaitingConfirm: boolean;
	onMove: (card: TSalesFulfillmentCard, target: TSaleAttendanceStatusEnum) => void;
	onPatch: (input: TPatchSalesFulfillmentInput) => void;
	onViewDetails: (saleId: string) => void;
	canEditSales?: boolean;
}) {
	const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
		id: card.id,
		data: { from: card.statusAtendimento },
		disabled: isPending || awaitingConfirm,
	});

	return (
		<FulfillmentCard
			ref={setNodeRef}
			card={card}
			organizationConfig={organizationConfig}
			canEditSales={canEditSales}
			isPending={isPending}
			isDragging={isDragging}
			awaitingConfirm={awaitingConfirm}
			onMove={(target) => onMove(card, target)}
			onPatch={onPatch}
			onViewDetails={() => onViewDetails(card.id)}
			dragAttributes={attributes}
			dragListeners={listeners}
			className="animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none"
		/>
	);
}

/**
 * Trilha vertical de uma etapa recolhida. A trilha inteira e o alvo de clique, e a contagem vem no
 * topo porque uma etapa recolhida jamais pode esconder QUANTOS pedidos ela guarda. O ponto vermelho
 * e o que torna a compactacao segura em vez de apenas arrumada: sem ele, recolher uma etapa vira uma
 * forma de perder um pedido com pagamento em atraso.
 */
function CollapsedStageRail({
	status,
	count,
	hasOverduePayment,
	isDropTarget,
	onExpand,
	controlsId,
}: {
	status: TPipelineStatus;
	count: number;
	hasOverduePayment: boolean;
	isDropTarget: boolean;
	onExpand: () => void;
	controlsId: string;
}) {
	const meta = ATTENDANCE_COLUMN_META[status];
	const Icon = meta.icon;

	return (
		<button
			type="button"
			onClick={onExpand}
			aria-expanded={false}
			aria-controls={controlsId}
			aria-label={`Expandir etapa ${meta.label}, ${count} pedido(s)`}
			className={cn(
				"group/rail absolute inset-0 z-10 flex flex-col items-center gap-2 overflow-hidden rounded-xl border py-2",
				"transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15",
				"animate-in fade-in-0 duration-200 motion-reduce:animate-none",
				isDropTarget
					? "border-solid border-primary bg-primary/10"
					: "border-dashed border-border/60 bg-secondary/50 hover:border-border hover:bg-accent focus-visible:border-primary",
			)}
		>
			<span className={cn(COUNT_BADGE_CLASS, isDropTarget ? "bg-primary text-primary-foreground" : "bg-background")}>{count}</span>
			<Icon className={cn("h-4 w-4 shrink-0 transition-colors", isDropTarget ? "text-primary" : "text-muted-foreground")} />
			{hasOverduePayment ? (
				<span
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
					title={`Há pedido com pagamento em atraso em ${meta.label}.`}
					aria-label="Pagamento em atraso nesta etapa"
					role="img"
				/>
			) : null}

			<span className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
				<span
					className={cn(
						"truncate text-xs font-extrabold uppercase tracking-wide transition-colors [writing-mode:vertical-rl] rotate-180",
						isDropTarget && "text-primary",
					)}
				>
					{meta.label}
				</span>
			</span>

			{isDropTarget ? (
				<span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-primary">Soltar</span>
			) : (
				<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-visible/rail:opacity-100" />
			)}
		</button>
	);
}

export function FulfillmentColumn({
	status,
	cards,
	organizationConfig,
	pendingCardIds,
	pendingTransitionCardId,
	isCollapsed,
	hasOverduePayment,
	canCompact,
	onSetCollapsed,
	onFocus,
	onMove,
	onPatch,
	onViewDetails,
	canEditSales,
}: {
	status: TPipelineStatus;
	cards: TSalesFulfillmentCard[];
	organizationConfig: TOrganizationConfiguration;
	pendingCardIds: Set<string>;
	pendingTransitionCardId: string | null;
	isCollapsed: boolean;
	hasOverduePayment: boolean;
	canCompact: boolean;
	onSetCollapsed: (status: TPipelineStatus, collapsed: boolean) => void;
	onFocus: (status: TPipelineStatus) => void;
	onMove: (card: TSalesFulfillmentCard, target: TSaleAttendanceStatusEnum) => void;
	onPatch: (input: TPatchSalesFulfillmentInput) => void;
	onViewDetails: (saleId: string) => void;
	canEditSales?: boolean;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: status });
	const meta = ATTENDANCE_COLUMN_META[status];
	const Icon = meta.icon;
	const bodyId = `fulfillment-column-body-${status}`;
	const isCollapsedDropTarget = isCollapsed && isOver;

	return (
		<div
			ref={setNodeRef}
			style={{
				width: isCollapsed ? (isOver ? BOARD_RAIL_ACTIVE_WIDTH_PX : BOARD_RAIL_WIDTH_PX) : BOARD_COLUMN_WIDTH_PX,
				transitionTimingFunction: COMPACTION_EASING,
			}}
			className="relative h-full min-h-0 shrink-0 snap-start transition-[width] duration-200 motion-reduce:transition-none"
		>
			{/* Recorte: o conteudo expandido existe sempre em 300px e apenas some por baixo da borda. */}
			<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
				<div
					style={{ width: BOARD_COLUMN_WIDTH_PX }}
					inert={isCollapsed || undefined}
					aria-hidden={isCollapsed || undefined}
					className={cn(
						"flex h-full min-h-0 shrink-0 flex-col gap-2 transition-opacity duration-150 motion-reduce:transition-none",
						isCollapsed && "opacity-0",
					)}
				>
					<div className="group/header flex shrink-0 items-center gap-1.5 px-1.5">
						<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="truncate text-xs font-extrabold uppercase tracking-wide">{meta.label}</span>
						<span className={cn(COUNT_BADGE_CLASS, "ml-auto")}>{cards.length}</span>
						<div
							className={cn(
								"flex items-center gap-0.5 opacity-60 transition-opacity group-hover/header:opacity-100 focus-within:opacity-100",
								!canCompact && "hidden",
							)}
						>
							<button
								type="button"
								onClick={() => onFocus(status)}
								aria-label={`Focar em ${meta.label} e recolher as demais etapas`}
								title={`Focar em ${meta.label}`}
								className={HEADER_BUTTON_CLASS}
							>
								<Maximize2 className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={() => onSetCollapsed(status, true)}
								aria-expanded
								aria-controls={bodyId}
								aria-label={`Recolher etapa ${meta.label}`}
								title={`Recolher ${meta.label}`}
								className={HEADER_BUTTON_CLASS}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
						</div>
					</div>

					<div
						id={bodyId}
						className={cn(
							"scrollbar-subtle flex min-h-0 grow flex-col gap-2 overflow-y-auto rounded-xl border border-dashed p-1.5 transition-colors",
							isOver && !isCollapsed ? "border-foreground/30 bg-accent/50" : "border-border/60",
						)}
					>
						{cards.length === 0 ? (
							<div className="flex grow items-center justify-center py-8 text-center text-[11px] text-muted-foreground/60">{meta.hint}</div>
						) : (
							cards.map((card) => (
								<DraggableCard
									key={card.id}
									card={card}
									organizationConfig={organizationConfig}
									isPending={pendingCardIds.has(card.id)}
									awaitingConfirm={pendingTransitionCardId === card.id}
									onMove={onMove}
									onPatch={onPatch}
									onViewDetails={onViewDetails}
									canEditSales={canEditSales}
								/>
							))
						)}
					</div>
				</div>
			</div>

			{isCollapsed ? (
				<CollapsedStageRail
					status={status}
					count={cards.length}
					hasOverduePayment={hasOverduePayment}
					isDropTarget={isCollapsedDropTarget}
					onExpand={() => onSetCollapsed(status, false)}
					controlsId={bodyId}
				/>
			) : null}
		</div>
	);
}

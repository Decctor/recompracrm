"use client";
import type { TGetServiceCardsOutput } from "@/app/api/service-cards/route";
import type { TGetServicePointsOutput } from "@/app/api/service-points/route";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Ban, Clock, Pencil, Plus } from "lucide-react";
import { type TBoardTab, URGENCY_META, describeRoundShort, formatTabAge, urgencyRank } from "./board-meta";

// ============================================================================
// Cards do board. Densidade e proposital: ponto livre e um slot quieto de pouca
// tinta, conta aberta e um card cheio. A conta aberta no painel lateral ganha
// anel primario — o board continua visivel e mostra onde o operador esta.
// ============================================================================

export type TServicePoint = NonNullable<TGetServicePointsOutput["data"]["default"]>[number];
export type TServiceCard = NonNullable<TGetServiceCardsOutput["data"]["default"]>[number];

function statusLine(tab: TBoardTab) {
	if (!tab.critical) {
		return {
			label: tab.pedidos.length ? "Nada em aberto" : "Sem pedidos ainda",
			surface: "bg-secondary/50 text-muted-foreground",
			text: "text-muted-foreground",
			dot: "bg-muted-foreground/35",
		};
	}
	const meta = URGENCY_META[tab.critical.urgencia];
	return { label: describeRoundShort(tab.critical), surface: meta.surface, text: meta.text, dot: meta.dot };
}

// ----------------------------------------------------------------- Por conta

export function TabCard({ tab, now, selected, onSelect }: { tab: TBoardTab; now: number; selected: boolean; onSelect: () => void }) {
	const status = statusLine(tab);
	const people = [tab.responsavelVendedor?.nome, tab.cliente?.nome].filter(Boolean).join(" · ");

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"flex w-full flex-col gap-2.5 rounded-xl border bg-card px-4 py-3.5 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary",
				tab.urgencia === "atrasado" ? URGENCY_META.atrasado.border : "border-border",
				selected && "ring-2 ring-primary",
			)}
		>
			<div className="flex w-full items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="truncate text-sm font-bold tracking-tight">{tab.label}</span>
					{tab.codigo && tab.servicePoint ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">#{tab.codigo}</span> : null}
				</span>
				<span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
					<Clock className="size-3" />
					{formatTabAge(tab.dataAbertura, now)}
				</span>
			</div>
			{/* Com parcial recebido, o numero grande e o que falta cobrar; o pago fica discreto ao lado. */}
			<span className="flex items-baseline gap-2">
				<span className="text-2xl font-bold leading-none tracking-tight tabular-nums">
					{formatToMoney((tab.valorPago ?? 0) > 0 ? (tab.valorRestante ?? 0) : (tab.consumoParcial ?? 0))}
				</span>
				{(tab.valorPago ?? 0) > 0 ? (
					<span className="whitespace-nowrap text-xs font-bold text-success tabular-nums">{formatToMoney(tab.valorPago ?? 0)} pago</span>
				) : null}
			</span>
			<div className={cn("flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold", status.surface)}>
				<span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
				<span className="min-w-0 flex-1 truncate">{status.label}</span>
				{tab.rounds.length > 1 ? <span className="shrink-0 font-bold opacity-75">+{tab.rounds.length - 1}</span> : null}
			</div>
			{people ? <span className="w-full truncate text-xs text-muted-foreground">{people}</span> : null}
		</button>
	);
}

// ------------------------------------------------------------------ Por mesa

export function FreePointTile({ point, onOpen, onEdit }: { point: TServicePoint; onOpen: () => void; onEdit: () => void }) {
	return (
		<div className="relative flex">
			<button
				type="button"
				onClick={onOpen}
				className="flex min-h-24 flex-1 flex-col items-start justify-between gap-3 rounded-xl border border-dashed border-border px-3.5 py-3 text-left transition-colors hover:border-success hover:bg-success-surface"
			>
				<span className="pr-6 text-sm font-bold text-foreground/80">{point.rotulo}</span>
				<span className="flex w-full items-center justify-between text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-success" aria-hidden />
						{point.capacidade ? `${point.capacidade} lugares` : "Livre"}
					</span>
					{/* Sempre visivel: no celular nao existe hover. */}
					<span className="flex items-center gap-0.5 font-bold text-primary">
						<Plus className="size-3.5" />
						Abrir
					</span>
				</span>
			</button>
			<EditTileButton onClick={onEdit} ariaLabel={`Editar ponto ${point.rotulo}`} />
		</div>
	);
}

type OccupiedTileProps = {
	label: string;
	pointTabs: TBoardTab[];
	now: number;
	selectedTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onEdit?: () => void;
	editLabel?: string;
	/** Identificacao de cada conta dentro do tile. Padrao: comanda, cliente ou vendedor. */
	rowLabel?: (tab: TBoardTab) => string;
};

export function OccupiedTile({ label, pointTabs, now, selectedTabId, onSelectTab, onEdit, editLabel, rowLabel }: OccupiedTileProps) {
	const urgencia = pointTabs.reduce<TBoardTab["urgencia"]>(
		(worst, tab) => (urgencyRank(tab.urgencia) > urgencyRank(worst) ? tab.urgencia : worst),
		null,
	);
	// Soma do que ainda falta cobrar no ponto (parciais ja recebidos descontados).
	const consumo = pointTabs.reduce((sum, tab) => sum + ((tab.valorPago ?? 0) > 0 ? (tab.valorRestante ?? 0) : (tab.consumoParcial ?? 0)), 0);
	const selected = pointTabs.some((tab) => tab.id === selectedTabId);

	return (
		<div
			className={cn(
				"relative flex min-h-24 flex-1 flex-col gap-2 rounded-xl border p-3",
				urgencia === "atrasado"
					? "border-transparent bg-destructive/10"
					: urgencia === "atencao"
						? "border-transparent bg-warning-surface"
						: "border-border bg-card",
				selected && "ring-2 ring-primary",
			)}
		>
			<div className={cn("flex items-baseline justify-between gap-1.5 px-0.5", onEdit && "pr-7")}>
				<span className="truncate text-sm font-bold">{label}</span>
				<span className="shrink-0 text-sm font-bold tabular-nums">{formatToMoney(consumo)}</span>
			</div>
			<div className="flex flex-col gap-1.5">
				{pointTabs.map((tab) => {
					const status = statusLine(tab);
					const tinted = tab.critical && tab.critical.urgencia !== "no-prazo";
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => onSelectTab(tab.id)}
							className="flex w-full flex-col gap-0.5 rounded-lg bg-background/70 px-2.5 py-1.5 text-left transition-colors hover:bg-background"
						>
							<span className="flex w-full justify-between gap-1.5 text-xs font-bold">
								<span className="truncate">
									{rowLabel ? rowLabel(tab) : tab.codigo ? `Comanda ${tab.codigo}` : (tab.cliente?.nome ?? tab.responsavelVendedor?.nome ?? "Conta")}
								</span>
								<span className="shrink-0 text-muted-foreground">{formatTabAge(tab.dataAbertura, now)}</span>
							</span>
							<span className={cn("truncate text-xs font-bold", tinted ? status.text : "text-muted-foreground")}>{status.label}</span>
						</button>
					);
				})}
			</div>
			{onEdit ? <EditTileButton onClick={onEdit} ariaLabel={editLabel ?? `Editar ponto ${label}`} /> : null}
		</div>
	);
}

// ---------------------------------------------------------------- Por comanda

/**
 * Comanda fixa sem conta aberta. Com comandas cadastradas em uso, o clique abre a conta
 * no cartao; antes disso (cartoes ainda na grafica) o tile so leva a edicao.
 */
export function FreeCardTile({ card, onOpen, onEdit }: { card: TServiceCard; onOpen?: () => void; onEdit: () => void }) {
	const disabled = !card.ativo;
	return (
		<div className="relative flex">
			<button
				type="button"
				onClick={!disabled && onOpen ? onOpen : onEdit}
				className={cn(
					"flex min-h-20 flex-1 flex-col items-start justify-between gap-2 rounded-xl border border-dashed border-border px-3.5 py-3 text-left transition-colors",
					disabled ? "bg-secondary/40 text-muted-foreground" : onOpen ? "hover:border-success hover:bg-success-surface" : "hover:bg-secondary/50",
				)}
			>
				<span className={cn("pr-6 text-sm font-bold", disabled ? "text-muted-foreground line-through" : "text-foreground/80")}>
					Comanda {card.codigo}
				</span>
				<span className="flex w-full items-center justify-between text-xs text-muted-foreground">
					{disabled ? (
						<span className="flex items-center gap-1.5">
							<Ban className="size-3" />
							Desativada
						</span>
					) : (
						<span className="flex items-center gap-1.5">
							<span className="size-1.5 rounded-full bg-success" aria-hidden />
							Livre
						</span>
					)}
					{!disabled && onOpen ? (
						<span className="flex items-center gap-0.5 font-bold text-primary">
							<Plus className="size-3.5" />
							Abrir
						</span>
					) : null}
				</span>
			</button>
			<EditTileButton onClick={onEdit} ariaLabel={`Editar comanda ${card.codigo}`} />
		</div>
	);
}

function EditTileButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
	return (
		<Button
			size="icon"
			variant="ghost"
			aria-label={ariaLabel}
			// Discreto, mas nunca invisivel: esconder atras de hover deixaria a edicao
			// inalcancavel no toque.
			className="absolute right-1.5 top-1.5 size-7 text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground"
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
		>
			<Pencil className="size-3.5" />
		</Button>
	);
}

"use client";

import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/**
 * Peças do bloco "Resultado" das estatísticas de campanhas (visão geral e campanha): o número de
 * receita com a comparação, a barra que separa o incremental do resto e a faixa de indicadores que
 * fecha o bloco, lida como funil da esquerda para a direita.
 */

export function getPercentageChange(current: number, previous: number | null | undefined): number | null {
	if (previous == null) return null;
	if (previous === 0) return current === 0 ? 0 : null;
	return ((current - previous) / Math.abs(previous)) * 100;
}

/** Variação contra o período anterior. Sem base comparável (anterior zero ou ausente), não mostra nada. */
export function DeltaBadge({ current, previous, className }: { current: number; previous: number | null | undefined; className?: string }) {
	const change = getPercentageChange(current, previous);
	if (change == null || change === 0) return null;
	const isUp = change > 0;
	const Icon = isUp ? TrendingUp : TrendingDown;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums",
				isUp ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
				className,
			)}
		>
			<Icon className="size-3 min-h-3 min-w-3" />
			{formatDecimalPlaces(Math.abs(change))}%
		</span>
	);
}

/** Valor em moeda com os centavos menores: "R$ 186.420" + ",50". */
export function MoneyFigure({ value, className }: { value: number; className?: string }) {
	const formatted = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const commaIndex = formatted.lastIndexOf(",");
	const whole = commaIndex >= 0 ? formatted.slice(0, commaIndex) : formatted;
	const cents = commaIndex >= 0 ? formatted.slice(commaIndex) : "";
	return (
		<span className={cn("font-extrabold tracking-tight tabular-nums", className)}>
			{whole}
			<span className="text-[0.45em] font-bold text-muted-foreground">{cents}</span>
		</span>
	);
}

type ResultHeadlineProps = {
	label: string;
	value: number;
	previous?: number | null;
	previousText?: string;
};

export function ResultHeadline({ label, value, previous, previousText }: ResultHeadlineProps) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<span className="text-label text-muted-foreground">{label}</span>
				<DeltaBadge current={value} previous={previous} />
			</div>
			<MoneyFigure value={value} className="text-4xl sm:text-5xl" />
			{previousText ? <span className="text-[0.7rem] font-medium text-muted-foreground uppercase">{previousText}</span> : null}
		</div>
	);
}

/** A receita incremental como fatia da receita total: âmbar até onde vai o incremental, cinza no resto. */
export function RevenueSplitBar({ part, total, className }: { part: number; total: number; className?: string }) {
	const share = total > 0 ? Math.min(Math.max(part / total, 0), 1) : 0;
	return (
		<div className={cn("flex h-2 w-full gap-1", className)} role="img" aria-label={`${formatDecimalPlaces(share * 100)}% incremental`}>
			{share > 0 ? <div className="h-full rounded-full bg-[#FFB900]" style={{ width: `${share * 100}%` }} /> : null}
			{share < 1 ? <div className="h-full flex-1 rounded-full bg-muted" /> : null}
		</div>
	);
}

type SplitFigureProps = {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	iconClassName?: string;
};

export function SplitFigure({ icon: Icon, label, value, hint, iconClassName }: SplitFigureProps) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="flex items-center gap-1.5 text-label text-muted-foreground">
				<Icon className={cn("size-3.5 min-h-3.5 min-w-3.5", iconClassName)} />
				{label}
			</span>
			<span className="text-lg font-extrabold tracking-tight tabular-nums">{value}</span>
			{hint ? <span className="text-[0.7rem] text-muted-foreground">{hint}</span> : null}
		</div>
	);
}

export type TFunnelStripCell = {
	key: string;
	title: string;
	icon: ComponentType<{ className?: string }>;
	value: ReactNode;
	/** Selo ao lado do valor (taxa, participação). */
	badge?: ReactNode;
	hint?: ReactNode;
	hintClassName?: string;
	/** Mostra a seta de fluxo entre esta célula e a anterior. */
	flowsFromPrevious?: boolean;
};

/** Faixa de indicadores que fecha o bloco de resultado. Deve ir dentro de `Section.Bleed`. */
export function FunnelStrip({ cells }: { cells: TFunnelStripCell[] }) {
	return (
		<div
			className={cn(
				"grid grid-cols-1",
				cells.length === 4 && "lg:grid-cols-4",
				cells.length === 5 && "lg:grid-cols-5",
				cells.length === 3 && "lg:grid-cols-3",
			)}
		>
			{cells.map((cell, index) => {
				const Icon = cell.icon;
				return (
					<div
						key={cell.key}
						className={cn("relative flex min-w-0 flex-col gap-1 border-border px-4 py-4", index > 0 && "border-t lg:border-t-0 lg:border-l")}
					>
						{cell.flowsFromPrevious ? (
							<span className="absolute top-1/2 -left-2.5 z-10 hidden size-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground lg:flex">
								<ChevronRight className="size-3 min-h-3 min-w-3" />
							</span>
						) : null}
						<div className="flex items-start justify-between gap-2">
							<span className="text-label text-muted-foreground">{cell.title}</span>
							<Icon className="size-4 min-h-4 min-w-4 shrink-0 text-muted-foreground" />
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-2xl font-extrabold tracking-tight tabular-nums">{cell.value}</span>
							{cell.badge}
						</div>
						{cell.hint ? <span className={cn("text-[0.7rem] text-muted-foreground uppercase", cell.hintClassName)}>{cell.hint}</span> : null}
					</div>
				);
			})}
		</div>
	);
}

/** Selo neutro ao lado de um valor da faixa ("9,19% TAXA"). */
export function StripBadge({ children }: { children: ReactNode }) {
	return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-muted-foreground uppercase tabular-nums">{children}</span>;
}

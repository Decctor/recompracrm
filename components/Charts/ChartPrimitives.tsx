"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

// Peças dos gráficos de eventos (Estoque › Relatórios e aba Estoque do produto). O traço é SVG em
// `viewBox 0 0 100 100`; o que precisa de texto nítido ou interação (eixos, marcadores, tooltips)
// é HTML posicionado em porcentagem por cima dele. Ver `lib/charts/geometry.ts`.

/** Rótulos do eixo Y, alinhados às linhas de grade da área do gráfico. */
export function ChartYAxis({ ticks, height, className }: { ticks: { y: number; label: string }[]; height: number; className?: string }) {
	return (
		<div className={cn("relative", className)} style={{ height }}>
			{ticks.map((tick) => (
				<span
					key={`${tick.label}-${tick.y}`}
					className="text-muted-foreground absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums"
					style={{ top: `${tick.y}%` }}
				>
					{tick.label}
				</span>
			))}
		</div>
	);
}

export function ChartGridLines({ ticks }: { ticks: { y: number }[] }) {
	return (
		<>
			{ticks.map((tick) => (
				<div key={tick.y} className="border-border pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: `${tick.y}%` }} />
			))}
		</>
	);
}

/** Rótulos do eixo X, centralizados em cada posição. */
export function ChartXAxis({ ticks, height = 22 }: { ticks: { x: number; label: string }[]; height?: number }) {
	return (
		<div className="relative" style={{ height }}>
			{ticks.map((tick) => (
				<span
					key={`${tick.label}-${tick.x}`}
					className="text-muted-foreground absolute top-1.5 -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums"
					style={{ left: `${tick.x}%` }}
				>
					{tick.label}
				</span>
			))}
		</div>
	);
}

/** Linha vertical e ponto do dia sob o cursor. */
export function ChartCrosshair({ x, y, dotClassName }: { x: number; y?: number; dotClassName?: string }) {
	return (
		<>
			<div className="bg-foreground/25 pointer-events-none absolute inset-y-0 w-px" style={{ left: `${x}%` }} />
			{y != null ? (
				<div
					className={cn(
						"pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-info",
						dotClassName,
					)}
					style={{ left: `${x}%`, top: `${y}%` }}
				/>
			) : null}
		</>
	);
}

/**
 * Colunas invisíveis que capturam o hover de cada slot (dia, semana, produto). Mais barato e mais
 * previsível que calcular o slot pelo `clientX`.
 */
export function ChartHoverColumns({ count, onEnter, width = 100 }: { count: number; onEnter: (index: number) => void; width?: number }) {
	return (
		<div className="absolute inset-y-0 left-0 flex" style={{ width: `${width}%` }}>
			{Array.from({ length: count }).map((_, index) => (
				<div key={index} className="h-full flex-1" onMouseEnter={() => onEnter(index)} />
			))}
		</div>
	);
}

/**
 * Marcador de evento sobre a linha: círculo com ícone, que cresce quando ativo. É um botão para
 * funcionar também no teclado e no toque (foco/clique abre o mesmo popover do hover).
 */
export function ChartEventMarker({
	x,
	y,
	icon: Icon,
	className,
	active,
	label,
	size = 26,
	onEnter,
	onLeave,
	onClick,
}: {
	x: number;
	y: number;
	icon: LucideIcon;
	className: string;
	active?: boolean;
	label: string;
	size?: number;
	onEnter?: () => void;
	onLeave?: () => void;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			className={cn(
				"absolute z-[5] flex cursor-pointer items-center justify-center rounded-full border-2 border-card shadow-[0_2px_6px_rgb(0_0_0/0.18)] transition-transform duration-100 focus-visible:outline-2 focus-visible:outline-ring",
				className,
			)}
			style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, transform: `translate(-50%, -50%) scale(${active ? 1.18 : 1})` }}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onFocus={onEnter}
			onBlur={onLeave}
			onClick={onClick}
		>
			<Icon style={{ width: size / 2, height: size / 2 }} strokeWidth={2.25} />
		</button>
	);
}

/**
 * Cartão flutuante (tooltip do dia ou popover do evento) ancorado num ponto do gráfico. Abre para a
 * esquerda quando o ponto está na metade direita, para não vazar da área.
 */
export function ChartFloatingCard({
	x,
	y,
	flipAt = 58,
	offset = 20,
	verticalShift = "-20%",
	className,
	style,
	children,
}: {
	x: number;
	y?: number;
	flipAt?: number;
	offset?: number;
	verticalShift?: string;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const toLeft = x > flipAt;
	return (
		<div
			className={cn(
				"bg-popover text-popover-foreground border-border pointer-events-none absolute z-20 flex flex-col gap-2 rounded-xl border p-3 text-xs shadow-[0_12px_24px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)]",
				className,
			)}
			style={{
				left: `${x}%`,
				top: y != null ? `${y}%` : 8,
				transform: `translate(${toLeft ? `calc(-100% - ${offset}px)` : `${offset}px`}, ${y != null ? verticalShift : "0"})`,
				...style,
			}}
		>
			{children}
		</div>
	);
}

/** Chip de tipo do evento ("AQUISIÇÃO", "DESCARTE") e os chips de origem ao lado. */
export function EventChip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className: string }) {
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold tracking-tight", className)}>
			<Icon className="size-3.5" />
			{label}
		</span>
	);
}

export function OriginChip({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
	return (
		<span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold">
			{Icon ? <Icon className="size-3" /> : null}
			{label}
		</span>
	);
}

/** Item de legenda: amostra (linha, tracejado, quadrado) + rótulo. */
export function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{swatch}
			{label}
		</span>
	);
}

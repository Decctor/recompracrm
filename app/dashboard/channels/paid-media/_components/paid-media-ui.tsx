"use client";

import { Chip } from "@/components/ui/chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDelta, getMetaStatusMeta, type TAdsStatusTone } from "@/lib/paid-media/format";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Peças pequenas da página de Mídia paga que não existem nos primitivos: o delta entre períodos, o
 * status da Meta como `Chip`, a dica de rodapé e a montagem tardia das seções abaixo da dobra.
 */

type DeltaProps = {
	current: number | null | undefined;
	previous: number | null | undefined;
	lowerIsBetter?: boolean;
	className?: string;
};

/** Delta em pílula (`Chip`), para os números grandes. Sem base de comparação, não desenha nada. */
export function DeltaPill({ current, previous, lowerIsBetter, className }: DeltaProps) {
	const delta = getDelta(current, previous, lowerIsBetter);
	if (!delta) return null;
	const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
	return (
		<Chip.Root
			size="xs"
			shape="pill"
			variant={delta.tone === "good" ? "success" : delta.tone === "bad" ? "destructive" : "muted"}
			className={cn("font-bold", className)}
		>
			<Chip.Icon>
				<Icon />
			</Chip.Icon>
			{delta.text}
		</Chip.Root>
	);
}

/** Delta em texto, para células de tabela e linhas densas. */
export function DeltaText({ current, previous, lowerIsBetter, className }: DeltaProps) {
	const delta = getDelta(current, previous, lowerIsBetter);
	if (!delta) return null;
	return (
		<span
			className={cn(
				"text-micro",
				delta.tone === "good" && "text-success-surface-foreground",
				delta.tone === "bad" && "text-destructive-surface-foreground",
				delta.tone === "neutral" && "text-muted-foreground",
				className,
			)}
		>
			{delta.text}
		</span>
	);
}

const STATUS_CHIP_VARIANT: Record<TAdsStatusTone, "success" | "warning" | "destructive" | "info" | "muted"> = {
	success: "success",
	warning: "warning",
	destructive: "destructive",
	info: "info",
	muted: "muted",
};

export function AdsStatusChip({ status, className }: { status: string | null | undefined; className?: string }) {
	const meta = getMetaStatusMeta(status);
	return (
		<Chip.Root size="xs" shape="pill" variant={STATUS_CHIP_VARIANT[meta.tone]} className={cn("font-semibold", className)}>
			{meta.label}
		</Chip.Root>
	);
}

/** Ícone de informação com a explicação de uma métrica. */
export function InfoHint({ children, label = "Saiba mais" }: { children: ReactNode; label?: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						aria-label={label}
						className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				}
			>
				<Info className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>
				<p className="max-w-64 text-xs leading-snug">{children}</p>
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Monta o conteúdo só quando ele chega perto da tela, e não desmonta mais. As seções de baixo fazem
 * as chamadas mais pesadas à Meta; montadas de uma vez, disputariam o limite de requisições com o topo.
 */
export function LazyMount({ children, minHeight = 320 }: { children: ReactNode; minHeight?: number }) {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (visible) return;
		const node = ref.current;
		if (!node || typeof IntersectionObserver === "undefined") {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "320px 0px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [visible]);

	return (
		<div ref={ref} style={visible ? undefined : { minHeight }} className="w-full">
			{visible ? children : null}
		</div>
	);
}

/** Barra horizontal proporcional, usada em recortes e rankings. */
export function ProportionBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
	const width = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
	return (
		<div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
			<div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${width}%`, background: color }} />
		</div>
	);
}

/** Linha "rótulo — valor" dos painéis de detalhe. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-3 border-border/60 border-b py-2 last:border-b-0">
			<span className="text-micro shrink-0 text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right text-sm font-medium break-words">{children}</span>
		</div>
	);
}

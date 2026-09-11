"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ArrowUpRight, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Molduras comuns das abas do dashboard.
 *
 * O hub deixou de ser uma grade de cartões independentes e virou um painel com abas, então o que se
 * repete aqui não é mais "um widget" e sim três formas: o bloco emoldurado (`Panel`), o número com
 * contexto (`StatTile`) e a linha de lista com ação (`Panel.Row`). Cada bloco continua dono da sua
 * própria consulta e dos próprios estados de carga, erro e vazio — um endpoint quebrado apaga o
 * bloco dele, nunca a aba inteira.
 */

const frameClassName = "bg-card border-border flex min-w-0 flex-col rounded-xl border shadow-2xs";

function PanelRoot({ className, children }: { className?: string; children: ReactNode }) {
	return <section className={cn(frameClassName, className)}>{children}</section>;
}

type PanelHeaderProps = {
	title: string;
	/** Complemento à direita do título: contagem, janela, urgência. */
	hint?: ReactNode;
	/** Tom de atenção para o complemento — pendência que exige ação agora. */
	hintTone?: PanelTone;
	href?: string;
	hrefLabel?: string;
};

function PanelHeader({ title, hint, hintTone = "default", href, hrefLabel = "Ver todos" }: PanelHeaderProps) {
	return (
		<div className="flex w-full items-center justify-between gap-2 border-border border-b px-4 py-3">
			<h2 className="text-label truncate text-muted-foreground">{title}</h2>
			<div className="text-micro flex min-w-0 shrink-0 items-center gap-2">
				{hint ? <span className={cn("truncate", toneClassName[hintTone] || "text-muted-foreground")}>{hint}</span> : null}
				{href ? (
					<Link
						href={href}
						className="flex shrink-0 items-center gap-0.5 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{hrefLabel}
						<ArrowUpRight className="size-3.5" aria-hidden />
					</Link>
				) : null}
			</div>
		</div>
	);
}

export type PanelTone = "default" | "destructive" | "success" | "warning" | "muted";

const toneClassName: Record<PanelTone, string> = {
	default: "text-foreground",
	destructive: "text-destructive-surface-foreground",
	success: "text-success-surface-foreground",
	warning: "text-warning-surface-foreground",
	muted: "text-muted-foreground",
};

const toneSurfaceClassName: Record<PanelTone, string> = {
	default: "bg-muted text-foreground",
	destructive: "bg-destructive-surface text-destructive-surface-foreground",
	success: "bg-success-surface text-success-surface-foreground",
	warning: "bg-warning-surface text-warning-surface-foreground",
	muted: "bg-muted text-muted-foreground",
};

type PanelRowProps = {
	/** Marcador à esquerda: ícone em quadrado colorido, ponto de segmento, posição no ranking. */
	leading?: ReactNode;
	primary: ReactNode;
	secondary?: ReactNode;
	/** Valor ou ação à direita. */
	trailing?: ReactNode;
	href?: string;
};

function PanelRow({ leading, primary, secondary, trailing, href }: PanelRowProps) {
	const content = (
		<>
			{leading ? <span className="flex shrink-0 items-center justify-center">{leading}</span> : null}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-bold text-sm leading-tight">{primary}</span>
				{secondary ? <span className="text-micro truncate font-normal text-muted-foreground">{secondary}</span> : null}
			</span>
			{trailing !== undefined && trailing !== null ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
		</>
	);
	const rowClassName = "flex w-full items-center gap-3 border-border/60 border-b px-4 py-2.5 last:border-b-0";
	if (href) {
		return (
			<Link
				href={href}
				className={cn(rowClassName, "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
			>
				{content}
			</Link>
		);
	}
	return <div className={rowClassName}>{content}</div>;
}

/** Quadrado de ícone que abre a linha — o tom diz a urgência antes de o texto ser lido. */
function PanelRowIcon({ tone = "default", children }: { tone?: PanelTone; children: ReactNode }) {
	return <span className={cn("flex size-8 items-center justify-center rounded-lg [&>svg]:size-4", toneSurfaceClassName[tone])}>{children}</span>;
}

/** Ação à direita de uma linha. Não é um `Link`: a linha inteira já leva ao mesmo lugar. */
function PanelRowAction({ emphasis = false, children }: { emphasis?: boolean; children: ReactNode }) {
	return (
		<span
			className={cn(
				"text-micro flex h-7 items-center rounded-lg px-2.5 font-bold",
				emphasis ? "bg-primary text-primary-foreground" : "border border-border",
			)}
		>
			{children}
		</span>
	);
}

/**
 * Número com rótulo e um gráfico pequeno embaixo. O gráfico é `children` porque cada tile desenha o
 * seu — barra proporcional, medidor, sparkline — e não há forma comum a abstrair entre eles.
 */
type StatTileProps = {
	label: string;
	value: ReactNode;
	/** Variação ao lado do número. */
	delta?: ReactNode;
	deltaTone?: PanelTone;
	tone?: PanelTone;
	caption?: ReactNode;
	children?: ReactNode;
};

function StatTile({ label, value, delta, deltaTone = "success", tone = "default", caption, children }: StatTileProps) {
	return (
		<div className={cn(frameClassName, "gap-2 px-4 py-3.5")}>
			<span className="text-label text-muted-foreground">{label}</span>
			<div className="flex items-baseline gap-2">
				<span className={cn("font-black text-2xl leading-none tracking-tight", toneClassName[tone])}>{value}</span>
				{delta ? <span className={cn("font-bold text-xs", toneClassName[deltaTone])}>{delta}</span> : null}
			</div>
			{caption ? <span className="text-micro font-normal text-muted-foreground">{caption}</span> : null}
			{children ? <div className="mt-1.5">{children}</div> : null}
		</div>
	);
}

function PanelEmpty({ message }: { message: string }) {
	return (
		<div className="flex items-center gap-2 px-4 py-4 text-muted-foreground text-sm">
			<CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
			<span>{message}</span>
		</div>
	);
}

function PanelError({ error }: { error: unknown }) {
	return (
		<div className="flex items-start gap-2 px-4 py-4 text-destructive text-xs">
			<TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
			<span className="line-clamp-2">{getErrorMessage(error)}</span>
		</div>
	);
}

function PanelLoading({ rows = 3 }: { rows?: number }) {
	return (
		<div className="flex flex-col gap-2.5 px-4 py-4" aria-busy>
			{Array.from({ length: rows }, (_, index) => (
				<Skeleton key={index} className={cn("h-4 rounded", index % 2 === 0 ? "w-full" : "w-3/5")} />
			))}
		</div>
	);
}

export const Panel = Object.assign(PanelRoot, {
	Header: PanelHeader,
	Row: PanelRow,
	RowIcon: PanelRowIcon,
	RowAction: PanelRowAction,
	Empty: PanelEmpty,
	Error: PanelError,
	Loading: PanelLoading,
});

export { StatTile, toneClassName };

"use client";

import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { ArrowUpRight, CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Peças das abas do dashboard, montadas sobre `Section` — a moldura de cartão do app.
 *
 * Este arquivo já foi uma moldura própria (borda, raio, fundo e cabeçalho reimplementados) e isso
 * custou caro: o cabeçalho numa linha só com `truncate` virava "COMO A ..." no celular, que é
 * exatamente o problema que a `Section` resolve há tempo — `Section.Header` tem `flex-wrap` e
 * `Section.Actions` cai para a linha de baixo quando não cabe. A `Section` existe justamente porque
 * já haviam existido duas cascas concorrentes; não crie uma terceira. O que sobra aqui é o que a
 * `Section` não tem: o preset de cabeçalho do hub, a linha de lista, o tile de número e os estados
 * de carga, erro e vazio.
 */

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

type PanelHeaderProps = {
	title: string;
	/** Complemento do título: contagem, janela, urgência. */
	hint?: ReactNode;
	hintTone?: PanelTone;
	href?: string;
	hrefLabel?: string;
};

/**
 * Preset do cabeçalho do hub — não uma moldura nova. Todos os blocos repetem a mesma tríade
 * (título, complemento, link do módulo), então ela mora aqui em vez de em oito callsites; as peças
 * são as da `Section`, e é delas que vem a quebra de linha no celular.
 */
function PanelHeader({ title, hint, hintTone = "muted", href, hrefLabel = "Ver todos" }: PanelHeaderProps) {
	return (
		<Section.Header>
			<Section.Title className="text-muted-foreground">{title}</Section.Title>
			{hint ? <Section.Count className={cn("font-normal", toneClassName[hintTone])}>{hint}</Section.Count> : null}
			{href ? (
				<Section.Actions>
					<Link
						href={href}
						className="text-micro flex items-center gap-0.5 rounded-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{hrefLabel}
						<ArrowUpRight className="size-3.5" aria-hidden />
					</Link>
				</Section.Actions>
			) : null}
		</Section.Header>
	);
}

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
	// `px-3` alinha com o padding da `Section.Root` que o `Bleed` cancela.
	const rowClassName = "flex w-full items-center gap-3 border-border/60 border-b px-3 py-2.5 last:border-b-0";
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
		<Section.Root className="gap-2 py-3.5">
			<span className="text-label text-muted-foreground">{label}</span>
			<div className="flex items-baseline gap-2">
				<span className={cn("font-black text-2xl leading-none tracking-tight", toneClassName[tone])}>{value}</span>
				{delta ? <span className={cn("font-bold text-xs", toneClassName[deltaTone])}>{delta}</span> : null}
			</div>
			{caption ? <span className="text-micro font-normal text-muted-foreground">{caption}</span> : null}
			{children ? <div className="mt-1.5">{children}</div> : null}
		</Section.Root>
	);
}

function PanelEmpty({ message }: { message: string }) {
	return (
		<div className="flex items-center gap-2 text-muted-foreground text-sm">
			<CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
			<span>{message}</span>
		</div>
	);
}

function PanelError({ error }: { error: unknown }) {
	return (
		<div className="flex items-start gap-2 text-destructive text-xs">
			<TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
			<span className="line-clamp-2">{getErrorMessage(error)}</span>
		</div>
	);
}

function PanelLoading({ rows = 3 }: { rows?: number }) {
	return (
		<div className="flex flex-col gap-2.5" aria-busy>
			{Array.from({ length: rows }, (_, index) => (
				<Skeleton key={index} className={cn("h-4 rounded", index % 2 === 0 ? "w-full" : "w-3/5")} />
			))}
		</div>
	);
}

export const Panel = Object.assign(Section.Root, {
	Header: PanelHeader,
	/** Conteúdo com respiro. Estados de carga, erro e vazio moram aqui. */
	Body: Section.Body,
	/** Conteúdo que encosta na borda: listas com divisor e tabelas. */
	Bleed: Section.Bleed,
	Row: PanelRow,
	RowIcon: PanelRowIcon,
	RowAction: PanelRowAction,
	Empty: PanelEmpty,
	Error: PanelError,
	Loading: PanelLoading,
});

export { StatTile, toneClassName };

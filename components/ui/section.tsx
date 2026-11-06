"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Seção de conteúdo — o cartão que organiza qualquer bloco do app.
 *
 * Substitui o antigo `SectionWrapper` (props `title`/`icon`/`actions`) e o `DetailsSection` local
 * do módulo fiscal. Eram duas cascas para a mesma ideia, e a segunda existia por um motivo real: o
 * `SectionWrapper` só sabia conter conteúdo com respiro, e listas densas, tabelas e blocos de
 * código precisam encostar na borda do cartão. `Body` e `Bleed` são essa diferença, explícita.
 *
 * ```tsx
 * <Section.Root>
 *   <Section.Header>
 *     <Section.Icon><FileText /></Section.Icon>
 *     <Section.Title>Identificação</Section.Title>
 *     <Section.Count>{eventos.length}</Section.Count>
 *     <Section.Actions><Button size="sm">Editar</Button></Section.Actions>
 *   </Section.Header>
 *   <Section.Body>…</Section.Body>
 * </Section.Root>
 * ```
 */

type SectionRootProps = {
	className?: string;
	children: ReactNode;
};

/**
 * Sem `min-h-0` na raiz: dentro de um pai flex de altura fixa, `min-h-0` deixa a seção encolher
 * abaixo do próprio conteúdo — e o conteúdo vaza para fora da borda em vez de esticar o cartão.
 * Encolher assim é comportamento de painel com rolagem interna, que se pede via `className`, não o
 * padrão. O `min-h-0` do `Body` é outro: aquele habilita a rolagem interna quando a altura vem de
 * fora.
 */
function SectionRoot({ className, children }: SectionRootProps) {
	return (
		// `overflow-clip`, não `hidden`: recorta igual, mas não vira contexto de rolagem — com `hidden`,
		// qualquer `sticky` lá dentro (ex.: a barra de paginação) para de grudar na tela.
		<section
			data-slot="section"
			className={cn("flex w-full flex-col gap-6 overflow-clip rounded-xl border border-border bg-card px-3 py-4 shadow-xs", className)}
		>
			{children}
		</section>
	);
}

function SectionHeader({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div data-slot="section-header" className={cn("flex min-h-8 w-full flex-wrap items-center gap-x-2 gap-y-2", className)}>
			{children}
		</div>
	);
}

/** `Actions` encosta na direita do cabeçalho pelo `ml-auto`, e quebra para a linha de baixo quando não cabe. */
function SectionActions({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div data-slot="section-actions" className={cn("order-last ml-auto flex shrink-0 items-center gap-2", className)}>
			{children}
		</div>
	);
}

function SectionIcon({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<span data-slot="section-icon" className={cn("flex shrink-0 items-center [&_svg]:size-4 [&_svg]:min-h-4 [&_svg]:min-w-4", className)}>
			{children}
		</span>
	);
}

/**
 * Título da seção. `<h2>`, não `<h1>`: o `<h1>` é o título da página, e uma tela com seis seções
 * emitia seis `<h1>` — leitor de tela sem hierarquia nenhuma. O caixa alta é do CSS, então o texto
 * se escreve em sentence case.
 */
function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<h2 data-slot="section-title" className={cn("min-w-0 truncate text-xs font-bold tracking-tight uppercase", className)}>
			{children}
		</h2>
	);
}

/** Contagem ao lado do título — quantos itens a seção lista. */
function SectionCount({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<span data-slot="section-count" className={cn("shrink-0 text-xs font-bold text-muted-foreground tabular-nums", className)}>
			{children}
		</span>
	);
}

/** Conteúdo com respiro — o caso comum. */
function SectionBody({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div data-slot="section-body" className={cn("flex min-h-0 w-full flex-1 flex-col gap-3", className)}>
			{children}
		</div>
	);
}

/**
 * Conteúdo que encosta na borda: listas com divisor, tabelas, `<pre>` de payload.
 *
 * As margens negativas cancelam o `px-3 py-4` e o `gap-6` da raiz — por isso as duas classes moram
 * no mesmo arquivo. O filete no topo é do próprio bloco, não do cabeçalho: quem separa a lista do
 * título é a lista, e um cabeçalho sozinho não deve desenhar linha nenhuma.
 */
function SectionBleed({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div
			data-slot="section-bleed"
			className={cn("-mx-3 -mt-6 flex w-auto flex-col border-t border-border first:mt-0 first:border-t-0 last:-mb-4", className)}
		>
			{children}
		</div>
	);
}

export const Section = {
	Root: SectionRoot,
	Header: SectionHeader,
	Icon: SectionIcon,
	Title: SectionTitle,
	Count: SectionCount,
	Actions: SectionActions,
	Body: SectionBody,
	Bleed: SectionBleed,
};

"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Printer } from "lucide-react";
import { type ReactNode, createContext, use, useCallback, useMemo, useState } from "react";

/**
 * Dock de impressão: a moldura de controle que fica em volta de uma peça imprimível (pôster de
 * recompensas, display do ponto de interação, playbook, etiquetas) e some no papel.
 *
 * Cada superfície de impressão tinha construído a sua — o display do POI chegou a manter DUAS
 * cópias do mesmo controle, uma para `lg:` e outra para o mobile, e as duas divergiram. O dock é
 * um componente composto: o provider injeta o estado, os subcomponentes leem o contrato pelo
 * contexto, e cada página compõe exatamente as peças que precisa.
 *
 * Uma moldura só, e não uma por posição: as duas peças que existem hoje querem a mesma cápsula
 * flutuante, e variante que ninguém escolhe é peso morto.
 *
 * O contrato é genérico de propósito (`selections: Record<string, string>`), porque quem manda no
 * significado das opções é a peça: para o pôster, `size` e `orientation`; para o display do POI,
 * só `size`. O preço é perder o tipo literal na fronteira do provider — que é exatamente onde a
 * regra manda a implementação concreta viver.
 *
 * @see .agents/skills/vercel-composition-patterns
 */

export type TPrintDockState = {
	/** Valor corrente de cada grupo de opções, indexado pelo id do grupo. */
	selections: Record<string, string>;
};

export type TPrintDockActions = {
	select: (groupId: string, value: string) => void;
	print: () => void;
};

export type TPrintDockMeta = {
	/** O que está sendo impresso. Vira o rótulo do dock. */
	title: string;
	/** Quem assina a peça — a organização, normalmente. */
	subject: string | null;
};

export type TPrintDockContextValue = {
	state: TPrintDockState;
	actions: TPrintDockActions;
	meta: TPrintDockMeta;
};

const PrintDockContext = createContext<TPrintDockContextValue | null>(null);
/** Id do grupo de opções em volta, para que `PrintDock.Option` não precise repeti-lo. */
const PrintDockGroupContext = createContext<string | null>(null);

function usePrintDock() {
	const value = use(PrintDockContext);
	if (!value) throw new Error("Os subcomponentes do PrintDock precisam estar dentro de <PrintDock.Provider>.");
	return value;
}

function usePrintDockGroup() {
	const groupId = use(PrintDockGroupContext);
	if (!groupId) throw new Error("<PrintDock.Option> precisa estar dentro de <PrintDock.Options>.");
	return groupId;
}

function PrintDockProvider({ children, state, actions, meta }: TPrintDockContextValue & { children: ReactNode }) {
	const value = useMemo(() => ({ state, actions, meta }), [actions, meta, state]);
	return <PrintDockContext value={value}>{children}</PrintDockContext>;
}

/**
 * Estado local para as peças cujas opções não precisam sobreviver a um recarregamento. Quem
 * sincroniza a escolha com a URL (o pôster de recompensas) monta o próprio valor e passa direto
 * para o `Provider` — o provider é o único lugar que sabe como o estado é gerenciado.
 */
export function useLocalPrintDock({
	title,
	subject = null,
	defaults,
}: {
	title: string;
	subject?: string | null;
	defaults: Record<string, string>;
}): TPrintDockContextValue {
	const [selections, setSelections] = useState(defaults);
	const select = useCallback((groupId: string, value: string) => setSelections((current) => ({ ...current, [groupId]: value })), []);
	const print = useCallback(() => window.print(), []);

	return useMemo(() => ({ state: { selections }, actions: { select, print }, meta: { title, subject } }), [print, select, selections, subject, title]);
}

// ---------------------------------------------------------------------------
// Moldura
// ---------------------------------------------------------------------------

/**
 * Cápsula flutuante no rodapé, no mesmo idioma do `AdminDock` e do `SectionApplyBar`: recuada das
 * bordas, elevada, com desfoque atrás, e sem interceptar cliques no que passa por baixo.
 *
 * `fixed` e não `sticky` porque existe no máximo um dock por peça — o `SectionApplyBar` usa
 * `sticky` justamente pelo caso oposto, duas seções editáveis empilhando duas barras.
 *
 * Cada peça dentro tem regra explícita de encolhimento. A versão anterior deixava a identidade com
 * `flex-1` e a régua com `min-w-0` sem `nowrap`: a identidade comia o espaço livre, a régua
 * colapsava em uma palavra por linha e o botão passava por cima dela.
 */
function PrintDockFrame({ children }: { children: ReactNode }) {
	return (
		<aside
			aria-label="Controles de impressão"
			className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:pb-6 print:hidden"
		>
			<div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-3xl border border-border/70 bg-background/90 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md sm:flex-nowrap sm:rounded-full">
				{children}
			</div>
		</aside>
	);
}

function PrintDockDivider() {
	return <div className="mx-1 hidden h-6 w-px shrink-0 bg-border/80 sm:block" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------

/* Some antes de espremer as opções: numa cápsula estreita, quem manda é o controle, e a folha
   logo atrás já mostra de quem é a peça. */
function PrintDockIdentity() {
	const { meta } = usePrintDock();
	return (
		<div className="hidden min-w-0 max-w-44 shrink md:block">
			<span className="block truncate text-label text-primary">{meta.title}</span>
			{meta.subject ? <p className="mt-0.5 truncate font-bold text-sm">{meta.subject}</p> : null}
		</div>
	);
}

function PrintDockOptions({ groupId, label, children }: { groupId: string; label: string; children: ReactNode }) {
	return (
		<PrintDockGroupContext value={groupId}>
			<div className="flex shrink-0 rounded-full bg-muted p-1" role="group" aria-label={label}>
				{children}
			</div>
		</PrintDockGroupContext>
	);
}

/** `label` é a legenda acessível: use quando o conteúdo visível for um ícone ou uma sigla. */
function PrintDockOption({ value, label, children }: { value: string; label?: string; children: ReactNode }) {
	const groupId = usePrintDockGroup();
	const { state, actions } = usePrintDock();
	const isActive = state.selections[groupId] === value;

	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={isActive}
			onClick={() => actions.select(groupId, value)}
			className={cn(
				"grid h-8 min-w-10 shrink-0 place-items-center rounded-full px-3 font-extrabold text-xs transition-colors",
				isActive ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function PrintDockReadout({ children }: { children: ReactNode }) {
	return <div className="hidden min-w-0 shrink text-right sm:block">{children}</div>;
}

/** A linha que resume o arranjo. Nunca quebra: ou cabe inteira, ou some com a régua. */
function PrintDockReadoutValue({ children }: { children: ReactNode }) {
	return <p className="truncate whitespace-nowrap font-bold text-sm tabular-nums">{children}</p>;
}

function PrintDockReadoutNote({ children }: { children: ReactNode }) {
	return <p className="truncate whitespace-nowrap text-micro text-muted-foreground">{children}</p>;
}

function PrintDockPrint({ children = "Imprimir" }: { children?: ReactNode }) {
	const { actions } = usePrintDock();
	return (
		<Button type="button" size="sm" onClick={actions.print} className="shrink-0 gap-2 rounded-full">
			<Printer className="size-4" aria-hidden="true" />
			{children}
		</Button>
	);
}

export const PrintDock = {
	Provider: PrintDockProvider,
	Frame: PrintDockFrame,
	Divider: PrintDockDivider,
	Identity: PrintDockIdentity,
	Options: PrintDockOptions,
	Option: PrintDockOption,
	Readout: PrintDockReadout,
	ReadoutValue: PrintDockReadoutValue,
	ReadoutNote: PrintDockReadoutNote,
	Print: PrintDockPrint,
};

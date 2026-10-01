"use client";

import { formatCentavos } from "@/lib/platform-partnerships/earnings";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Peças visuais do painel do parceiro. O painel segue o protótipo do Claude Design (mobile primeiro,
 * cartões de 22px, rótulos em `text-label`) e fica responsivo: no desktop os mesmos blocos se
 * reorganizam em colunas, não viram outra tela.
 */

// Azul Profundo (DESIGN.md §2): superfície de marca do cartão do parceiro. Não tem token próprio —
// o único outro uso do tom é o texto do callout `info`, que inverte no tema escuro; o cartão não.
export const PARTNER_CARD_SURFACE = "bg-[#1a3d7a] text-white";

// ---------------------------------------------------------------------------------------------
// Ocultar valores — preferência do navegador, não do cadastro.
// ---------------------------------------------------------------------------------------------

const HIDE_VALUES_STORAGE_KEY = "recompra:partner-dashboard:hide-values";
const HideValuesContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function HideValuesProvider({ children }: { children: ReactNode }) {
	const [hidden, setHidden] = useState(false);
	useEffect(() => {
		try {
			setHidden(window.localStorage.getItem(HIDE_VALUES_STORAGE_KEY) === "1");
		} catch {}
	}, []);
	const toggle = useCallback(() => {
		setHidden((previous) => {
			try {
				window.localStorage.setItem(HIDE_VALUES_STORAGE_KEY, previous ? "0" : "1");
			} catch {}
			return !previous;
		});
	}, []);
	return <HideValuesContext.Provider value={{ hidden, toggle }}>{children}</HideValuesContext.Provider>;
}

export function useHideValues() {
	return useContext(HideValuesContext);
}

/** Valor em reais que respeita o "ocultar valores". `null` vira "—": sem base, não há número a mostrar. */
export function Money({ centavos, sign = false }: { centavos: number | null | undefined; sign?: boolean }) {
	const { hidden } = useHideValues();
	if (centavos === null || centavos === undefined) return <>—</>;
	if (hidden) return <>R$ ••••</>;
	return (
		<>
			{sign && centavos > 0 ? "+" : ""}
			{formatCentavos(centavos)}
		</>
	);
}

// ---------------------------------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------------------------------

export function PanelCard({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<section className={cn("rounded-[22px] bg-card text-numeric shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.04)]", className)}>
			{children}
		</section>
	);
}

export function PanelCardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
	return (
		<div className={cn("flex items-center justify-between gap-3 px-5 pt-3 pb-2", className)}>
			<h2 className="text-label text-muted-foreground">{title}</h2>
			{action}
		</div>
	);
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Link href={href} className="text-[13px] font-bold text-primary hover:underline">
			{children}
		</Link>
	);
}

export function StatTile({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col gap-1.5 rounded-[18px] bg-muted px-4 py-3.5", className)}>
			<span className="text-label text-[11px] text-muted-foreground">{label}</span>
			<span className="text-xl font-extrabold tracking-[-0.01em]">{value}</span>
		</div>
	);
}

export type TPillTone = "success" | "warning" | "info" | "neutral" | "danger";

const PILL_TONES: Record<TPillTone, string> = {
	success: "border-success/25 bg-success-surface text-success-surface-foreground",
	warning: "border-warning/40 bg-warning-surface text-warning-surface-foreground",
	info: "border-primary/20 bg-info-surface text-info-surface-foreground",
	neutral: "border-foreground/10 bg-foreground/5 text-muted-foreground",
	danger: "border-destructive/25 bg-destructive-surface text-destructive-surface-foreground",
};

export function Pill({ tone, children, className }: { tone: TPillTone; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
				PILL_TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}

export function Initials({
	children,
	className,
	tone = "info",
}: {
	children: ReactNode;
	className?: string;
	tone?: "info" | "bonus" | "success" | "neutral";
}) {
	const tones = {
		info: "bg-info-surface text-primary",
		bonus: "bg-warning text-warning-foreground",
		success: "bg-success-surface text-success-surface-foreground",
		neutral: "bg-muted text-muted-foreground",
	};
	return (
		<span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-sm font-extrabold", tones[tone], className)}>
			{children}
		</span>
	);
}

/** Cabeçalho das telas internas (loja, pagamento): voltar + título centrado. */
export function BackHeader({ href, title }: { href: string; title: string }) {
	return (
		<div className="flex items-center justify-between">
			<Link
				href={href}
				aria-label="Voltar"
				className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-border bg-card transition-colors hover:bg-muted"
			>
				<ChevronLeft className="h-[18px] w-[18px]" />
			</Link>
			<span className="text-sm font-bold">{title}</span>
			<span className="w-10" />
		</div>
	);
}

export function EmptyNote({ children }: { children: ReactNode }) {
	return <p className="px-5 pt-2 pb-5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function PanelSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<div className="h-[236px] animate-pulse rounded-[22px] bg-muted" />
			<div className="grid grid-cols-2 gap-2.5">
				<div className="h-[72px] animate-pulse rounded-[18px] bg-muted" />
				<div className="h-[72px] animate-pulse rounded-[18px] bg-muted" />
			</div>
			<div className="h-48 animate-pulse rounded-[22px] bg-muted" />
		</div>
	);
}

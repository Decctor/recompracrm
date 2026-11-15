"use client";

import { RequiredIndicator } from "@/components/Inputs/RequiredIndicator";
import { parseDecimalInput, useDecimalDraft } from "@/lib/hooks/use-decimal-draft";
import { cn } from "@/lib/utils";
import { Minus, Plus, Sparkles } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { formatQuantityDraft } from "../helpers/format";

/** Tons do construtor, sobre as superfícies semânticas do tema (DESIGN.md §2). */
export const TONE_CLASSES = {
	ok: "bg-success-surface text-success-surface-foreground",
	warn: "bg-warning-surface text-warning-surface-foreground",
	info: "bg-info-surface text-info-surface-foreground",
	bad: "bg-destructive/10 text-destructive",
	mute: "bg-muted text-muted-foreground",
} as const;
export type TTone = keyof typeof TONE_CLASSES;

/** Cartão das etapas: mesma moldura em todos os blocos do construtor. */
export function BuilderCard({ children, className }: { children: ReactNode; className?: string }) {
	return <section className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>{children}</section>;
}

/** Rótulo pequeno em caixa-alta usado dentro dos cartões ("QUANTIDADE", "LOTE (OPCIONAL)"). */
export function OverlineLabel({ children }: { children: ReactNode }) {
	return <span className="text-[0.7rem] font-extrabold uppercase tracking-widest text-muted-foreground">{children}</span>;
}

/** Marca de valor preenchido pelo construtor, até o operador mudar ("Receita · data", "Agora", "+45 min"). */
export function AutoBadge({ show = true, label }: { show?: boolean; label: string }) {
	if (!show) return null;
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-normal", TONE_CLASSES.info)}>
			<Sparkles className="h-3 w-3" />
			{label}
		</span>
	);
}

export function FieldLabel({ children, required, badge }: { children: ReactNode; required?: boolean; badge?: ReactNode }) {
	return (
		<span className="flex items-center gap-2 text-sm font-medium tracking-tight text-foreground/80">
			<span>
				{children}
				{required ? <RequiredIndicator /> : null}
			</span>
			{badge}
		</span>
	);
}

/** Valor só de leitura com a moldura de um input. */
export function StaticField({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm", className)}>{children}</div>;
}

/** Interruptor grande — o `Switch` do kit é pequeno demais para um dedo no tablet. */
export function BigToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
				checked ? "bg-primary" : "bg-border",
			)}
		>
			<span
				className={cn(
					"absolute top-0.5 left-0.5 h-7 w-7 rounded-full bg-background shadow-sm transition-transform",
					checked ? "translate-x-6" : "translate-x-0",
				)}
			/>
		</button>
	);
}

/**
 * Stepper de quantidade com botões grandes. O número no meio também aceita digitação, para valores que
 * não caem no passo (ex.: 12,3 KG).
 */
export function QuantityStepper({
	value,
	unit,
	step,
	min,
	max,
	onChange,
	size = "lg",
	decreaseLabel,
	increaseLabel,
	inputLabel,
}: {
	value: number;
	unit: string;
	step: number;
	min: number;
	max?: number;
	onChange: (value: number) => void;
	size?: "lg" | "md";
	decreaseLabel: string;
	increaseLabel: string;
	inputLabel: string;
}) {
	const { display, setDraft } = useDecimalDraft(value, formatQuantityDraft);
	const clamp = (next: number) => {
		const rounded = Math.round(next * 1000) / 1000;
		return Math.min(Math.max(rounded, min), max ?? Number.POSITIVE_INFINITY);
	};
	const large = size === "lg";
	const buttonClass = cn(
		"flex shrink-0 items-center justify-center bg-muted text-foreground transition-colors hover:bg-muted/70 active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
		large ? "h-[60px] w-[60px] rounded-[14px]" : "h-12 w-12 rounded-xl",
	);

	return (
		<div className={cn("flex w-fit items-center border border-border", large ? "gap-1.5 rounded-[18px] p-1.5" : "gap-1 rounded-2xl p-1")}>
			<button type="button" aria-label={decreaseLabel} className={buttonClass} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
				<Minus className="h-5 w-5" />
			</button>
			<label className={cn("flex items-baseline justify-center gap-1.5 px-2", large ? "min-w-[96px] sm:min-w-[160px]" : "min-w-[92px]")}>
				<span className="sr-only">{inputLabel}</span>
				<input
					inputMode="decimal"
					value={display}
					placeholder="0"
					onChange={(event) => {
						const raw = event.target.value.replace(/[^\d,.]/g, "");
						setDraft(raw);
						// O mínimo só vale ao sair do campo: digitar "0,7" passa por "0".
						onChange(Math.min(Math.round(parseDecimalInput(raw) * 1000) / 1000, max ?? Number.POSITIVE_INFINITY));
					}}
					onBlur={() => {
						setDraft(null);
						if (value < min) onChange(min);
					}}
					onFocus={(event) => event.target.select()}
					style={{ width: `${Math.max(display.length, 1) + 0.5}ch` }}
					className={cn(
						"min-w-[1.5ch] bg-transparent text-center font-extrabold leading-none tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50",
						large ? "text-[40px]" : "text-2xl",
					)}
				/>
				<span className={cn("font-semibold text-muted-foreground", large ? "text-base" : "text-xs")}>{unit}</span>
			</label>
			<button
				type="button"
				aria-label={increaseLabel}
				className={buttonClass}
				disabled={max !== undefined && value >= max}
				onClick={() => onChange(clamp(value + step))}
			>
				<Plus className="h-5 w-5" />
			</button>
		</div>
	);
}

/** Opção selecionável em formato de cartão compacto (lotes). */
export function OptionTile({
	selected,
	onClick,
	title,
	description,
}: {
	selected: boolean;
	onClick: () => void;
	title: string;
	description: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl border px-3.5 py-2 text-left transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
			)}
		>
			<span className="text-sm font-semibold">{title}</span>
			<span className="text-xs text-muted-foreground">{description}</span>
		</button>
	);
}

export function RadioCard({ selected, onClick, title, description }: { selected: boolean; onClick: () => void; title: string; description: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
			)}
		>
			<span className={cn("mt-px h-5 w-5 shrink-0 rounded-full border", selected ? "border-[5px] border-primary" : "border-muted-foreground/40")} />
			<span className="flex flex-col gap-1">
				<span className="text-sm font-semibold">{title}</span>
				<span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
			</span>
		</button>
	);
}

/** Miniatura da linha de item: iniciais, ou um ícone num tom. */
export function ItemThumb({ initials, icon: Icon, tone }: { initials?: string; icon?: ComponentType<{ className?: string }>; tone?: TTone }) {
	return (
		<span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-bold", TONE_CLASSES[tone ?? "mute"])}>
			{Icon ? <Icon className="h-3.5 w-3.5" /> : initials}
		</span>
	);
}

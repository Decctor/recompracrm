"use client";
import { formatToMoney } from "@/lib/formatting";
import { parseDecimalInput, useDecimalDraft } from "@/lib/hooks/use-decimal-draft";
import {
	EMPTY_SALE_ADJUSTMENT,
	resolveRoundDownDiscount,
	resolveTargetTotalDiscount,
	type TSaleAdjustmentInput,
	type TSaleAdjustmentMode,
} from "@/lib/sales/sale-adjustments";
import { cn } from "@/lib/utils";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

// ============================================================================
// Linha de ajuste do total (desconto ou acréscimo de cabeçalho), compartilhada
// pelo checkout do PDV e pelo fechamento de conta. Revelação progressiva:
// a linha mostra só o valor; a bandeja guarda a unidade (R$/%), os percentuais
// prontos e os helpers do desconto.
// ============================================================================

type TAdjustmentTone = "discount" | "surcharge";

// Cor semântica pelos tokens de tom (DESIGN.md, "os quatro papéis de um tom"): superfície suave no
// cartão, texto sobre a superfície, sólido só no controle ativo. O verde sólido é o passo forte,
// porque o `success` não passa contraste com texto branco em 11px.
const TONE_STYLES: Record<
	TAdjustmentTone,
	{ card: string; text: string; divider: string; field: string; chip: string; solid: string; ghost: string; focus: string }
> = {
	discount: {
		card: "border-destructive/25 bg-destructive-surface",
		text: "text-destructive-surface-foreground",
		divider: "border-destructive/15",
		field: "border-destructive/30 focus-within:border-destructive/60 focus-within:ring-destructive/15",
		chip: "border-destructive/30 bg-card hover:bg-destructive/10",
		solid: "border-destructive bg-destructive text-destructive-foreground",
		ghost: "hover:bg-destructive/10 aria-expanded:bg-destructive/10",
		focus: "focus-visible:ring-destructive/30",
	},
	surcharge: {
		card: "border-success/25 bg-success-surface",
		text: "text-success-surface-foreground",
		divider: "border-success/15",
		field: "border-success/30 focus-within:border-success/60 focus-within:ring-success/15",
		chip: "border-success/30 bg-card hover:bg-success/10",
		solid: "border-success-strong bg-success-strong text-white",
		ghost: "hover:bg-success/10 aria-expanded:bg-success/10",
		focus: "focus-visible:ring-success/30",
	},
};

const formatAmount = (mode: TSaleAdjustmentMode, value: number) =>
	mode === "PERCENTUAL" ? String(Number(value.toFixed(2))).replace(".", ",") : value.toFixed(2).replace(".", ",");

const chipClassName = (tone: TAdjustmentTone, active: boolean) =>
	cn(
		"h-7 whitespace-nowrap rounded-full border px-3 text-[11px] font-bold transition-colors outline-none focus-visible:ring-3",
		TONE_STYLES[tone].focus,
		active ? TONE_STYLES[tone].solid : cn(TONE_STYLES[tone].chip, TONE_STYLES[tone].text),
	);

const fieldClassName = (tone: TAdjustmentTone) =>
	cn(
		"flex items-center gap-1 rounded-full border bg-card px-3 transition-colors focus-within:ring-3",
		TONE_STYLES[tone].field,
		TONE_STYLES[tone].text,
	);

type AdjustmentRowProps = {
	icon: LucideIcon;
	label: string;
	/** Linha de apoio quando o ajuste está vazio. */
	hint: string;
	tone: TAdjustmentTone;
	value: TSaleAdjustmentInput;
	/** R$ efetivo do ajuste (no percentual, já calculado sobre a base). */
	resolvedValue: number;
	onChange: (next: TSaleAdjustmentInput) => void;
	/** Percentuais prontos dentro da bandeja. Tocar no ativo desfaz. */
	presets?: number[];
	/** Conteúdo extra da bandeja (helpers do desconto, limite do operador). */
	children?: ReactNode;
};

export function AdjustmentRow({ icon: Icon, label, hint, tone, value, resolvedValue, onChange, presets = [], children }: AdjustmentRowProps) {
	const [isOpen, setIsOpen] = useState(false);
	const trayId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const toggleRef = useRef<HTMLButtonElement>(null);
	const { display, setDraft } = useDecimalDraft(value.amount, (amount) => formatAmount(value.mode, amount));
	const isPercent = value.mode === "PERCENTUAL";
	const sign = tone === "discount" ? "−" : "+";
	const isPercentActive = (percent: number) => isPercent && value.amount === percent;
	const styles = TONE_STYLES[tone];

	function applyPercent(percent: number) {
		setDraft(null);
		onChange(isPercentActive(percent) ? EMPTY_SALE_ADJUSTMENT : { mode: "PERCENTUAL", amount: percent });
	}

	function changeMode(mode: TSaleAdjustmentMode) {
		if (mode === value.mode) return;
		// Trocar a unidade zera o valor: 10 reais não viram 10%.
		setDraft(null);
		onChange({ mode, amount: 0 });
		inputRef.current?.focus();
	}

	return (
		<div className={cn("flex flex-col rounded-xl border", styles.card)}>
			<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-2.5 py-2">
				<span className={cn("flex min-w-0 items-start gap-1.5", styles.text)}>
					<Icon className="mt-px size-3.5 shrink-0" aria-hidden />
					<span className="flex min-w-0 flex-col gap-1">
						<span className="text-label whitespace-nowrap">{label}</span>
						{value.amount > 0 ? (
							<span className="whitespace-nowrap text-[11px] font-semibold">
								{sign}
								{formatToMoney(resolvedValue)}
								{isPercent ? ` · ${formatAmount("PERCENTUAL", value.amount)}%` : null}
							</span>
						) : (
							<span className="whitespace-nowrap text-[11px] opacity-75">{hint}</span>
						)}
					</span>
				</span>
				<span className="ml-auto flex shrink-0 items-center gap-1">
					<label className={cn(fieldClassName(tone), "h-8 w-24")}>
						{isPercent ? null : <span className="text-[11px] font-semibold opacity-70">R$</span>}
						<input
							ref={inputRef}
							inputMode="decimal"
							aria-label={`${label} (${isPercent ? "%" : "R$"})`}
							placeholder={isPercent ? "0" : "0,00"}
							value={display}
							onChange={(event) => {
								const parsed = Math.max(0, parseDecimalInput(event.target.value));
								setDraft(event.target.value);
								onChange({ mode: value.mode, amount: isPercent ? Math.min(100, parsed) : parsed });
							}}
							onBlur={() => setDraft(null)}
							className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold outline-none placeholder:font-semibold placeholder:opacity-50"
						/>
						{isPercent ? <span className="text-[11px] font-semibold opacity-70">%</span> : null}
					</label>
					<button
						ref={toggleRef}
						type="button"
						aria-expanded={isOpen}
						aria-controls={trayId}
						aria-label={isOpen ? `Recolher opções de ${label.toLowerCase()}` : `Mais opções de ${label.toLowerCase()}`}
						onClick={() => setIsOpen((open) => !open)}
						className={cn(
							"flex size-8 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3",
							styles.text,
							styles.ghost,
							styles.focus,
						)}
					>
						<ChevronDown className={cn("size-4 transition-transform duration-150", isOpen && "rotate-180")} />
					</button>
				</span>
			</div>
			{isOpen ? (
				<div
					id={trayId}
					role="group"
					aria-label={`Opções de ${label.toLowerCase()}`}
					onKeyDown={(event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						setIsOpen(false);
						toggleRef.current?.focus();
					}}
					className={cn("mx-2.5 flex flex-col gap-2 border-t pt-2 pb-2.5 duration-150 animate-in fade-in slide-in-from-top-1", styles.divider)}
				>
					<div className="flex flex-wrap items-center gap-1">
						<span className={cn("flex h-7 items-center rounded-full border bg-card p-0.5", styles.field)}>
							{(["VALOR", "PERCENTUAL"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									aria-pressed={value.mode === mode}
									aria-label={mode === "VALOR" ? `${label} em reais` : `${label} em percentual`}
									onClick={() => changeMode(mode)}
									className={cn(
										"h-full min-w-8 rounded-full px-2.5 text-[11px] font-bold transition-colors outline-none focus-visible:ring-3",
										styles.focus,
										value.mode === mode ? styles.solid : cn(styles.text, "opacity-70 hover:opacity-100"),
									)}
								>
									{mode === "VALOR" ? "R$" : "%"}
								</button>
							))}
						</span>
						{presets.map((percent) => (
							<button
								key={percent}
								type="button"
								aria-pressed={isPercentActive(percent)}
								onClick={() => applyPercent(percent)}
								className={chipClassName(tone, isPercentActive(percent))}
							>
								{percent}%
							</button>
						))}
					</div>
					{children}
				</div>
			) : null}
		</div>
	);
}

type DiscountTotalHelpersProps = {
	/** Total com desconto geral zero. */
	totalWithoutDiscount: number;
	/** Maior desconto geral antes de algum piso do total entrar em ação. */
	maxDiscount: number;
	currentDiscount: number;
	/** Recebe o novo desconto geral em R$. */
	onApply: (discount: number) => void;
};

/** "Arredondar" e "Fechar em": helpers do desconto que resolvem o total que o cliente vai pagar. */
export function DiscountTotalHelpers({ totalWithoutDiscount, maxDiscount, currentDiscount, onApply }: DiscountTotalHelpersProps) {
	const [targetText, setTargetText] = useState("");
	const range = { totalWithoutDiscount, maxDiscount };
	const roundDown = resolveRoundDownDiscount({ ...range, currentDiscount });
	const target = targetText.trim() ? resolveTargetTotalDiscount({ ...range, target: parseDecimalInput(targetText) }) : null;
	const targetError =
		target && !target.ok
			? target.reason === "ABOVE_TOTAL"
				? `Maior que o total sem desconto (${formatToMoney(target.limit)}). Para cobrar a mais, use o acréscimo.`
				: `O menor total possível é ${formatToMoney(target.limit)}.`
			: null;

	function applyTarget() {
		if (!target?.ok) return;
		onApply(target.discount);
		setTargetText("");
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex flex-wrap items-center gap-1.5">
				{roundDown ? (
					<button type="button" onClick={() => onApply(roundDown.discount)} className={chipClassName("discount", false)}>
						Arredondar → {formatToMoney(roundDown.total)}
					</button>
				) : null}
				<span className="flex items-center gap-1">
					<label className={cn(fieldClassName("discount"), "h-7 w-40", targetError && "border-destructive")}>
						<span className="whitespace-nowrap text-[11px] font-semibold opacity-70">Fechar em R$</span>
						<input
							inputMode="decimal"
							aria-label="Fechar em (total desejado em R$)"
							aria-invalid={!!targetError}
							placeholder="0,00"
							value={targetText}
							onChange={(event) => setTargetText(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								applyTarget();
							}}
							className="min-w-0 flex-1 bg-transparent text-right text-xs font-bold outline-none placeholder:font-semibold placeholder:opacity-50"
						/>
					</label>
					<button
						type="button"
						disabled={!target?.ok}
						onClick={applyTarget}
						className={cn(chipClassName("discount", !!target?.ok), "disabled:pointer-events-none disabled:opacity-50")}
					>
						Aplicar
					</button>
				</span>
			</div>
			{targetError ? (
				<p role="alert" className="text-[11px] font-semibold text-destructive-surface-foreground">
					{targetError}
				</p>
			) : null}
		</div>
	);
}

import { cn } from "@/lib/utils";
import { BadgePercent, CirclePlus, Gift, type LucideIcon, PenLine } from "lucide-react";

/**
 * As quatro operações de uma transação do ponto de interação. A cor diz o que acontece com o
 * saldo e se repete em todo lugar onde a operação aparece: seletor da nova transação, resumo,
 * cartão da fila e aprovação. Verde acumula; azul usa saldo como desconto; violeta troca saldo por
 * recompensa — tracejado quando a recompensa é avulsa (fora do catálogo).
 */
export type TPoiOperationKind = "sale-only" | "discount" | "prize" | "free-form";

type TPoiOperationKindMeta = {
	label: string;
	shortLabel: string;
	icon: LucideIcon;
	/** Efeito no saldo, em poucas palavras ("+ saldo", "− saldo"). */
	balanceEffect: string;
	classes: {
		/** Fundo e borda de um bloco/cartão da operação. */
		surface: string;
		/** Quadrado do ícone, preenchido. */
		iconTile: string;
		/** Texto de título sobre `surface`. */
		title: string;
		/** Texto secundário sobre `surface`. */
		text: string;
		/** Selo pequeno (fila, chips). */
		badge: string;
		/** Valor monetário que sai do saldo. */
		amount: string;
		/** Barra de saldo usado. */
		bar: string;
		/** Estado selecionado de um cartão. */
		selected: string;
	};
};

export const POI_OPERATION_KINDS: Record<TPoiOperationKind, TPoiOperationKindMeta> = {
	"sale-only": {
		label: "Só pontuar",
		shortLabel: "PONTUAR",
		icon: CirclePlus,
		balanceEffect: "+ saldo",
		classes: {
			surface: "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30",
			iconTile: "bg-green-700 text-white",
			title: "text-green-900 dark:text-green-100",
			text: "text-green-800 dark:text-green-300",
			badge: "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-300",
			amount: "text-green-700 dark:text-green-400",
			bar: "bg-green-700",
			selected: "border-green-700 ring-4 ring-green-100 dark:ring-green-900/40",
		},
	},
	discount: {
		label: "Venda com desconto",
		shortLabel: "DESCONTO",
		icon: BadgePercent,
		balanceEffect: "− saldo",
		classes: {
			surface: "border-brand-secondary/25 bg-brand-secondary/5 dark:bg-brand-secondary/15",
			iconTile: "bg-brand-secondary text-brand-secondary-foreground",
			title: "text-brand-secondary dark:text-blue-200",
			text: "text-brand-secondary/90 dark:text-blue-300",
			badge: "border-brand-secondary/25 bg-brand-secondary/5 text-brand-secondary dark:bg-brand-secondary/20 dark:text-blue-200",
			amount: "text-brand-secondary dark:text-blue-300",
			bar: "bg-brand-secondary",
			selected: "border-brand-secondary ring-4 ring-brand-secondary/15",
		},
	},
	prize: {
		label: "Recompensa do catálogo",
		shortLabel: "RECOMPENSA",
		icon: Gift,
		balanceEffect: "− saldo",
		classes: {
			surface: "border-violet-200 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/30",
			iconTile: "bg-violet-700 text-white",
			title: "text-violet-900 dark:text-violet-100",
			text: "text-violet-800 dark:text-violet-300",
			badge: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300",
			amount: "text-violet-700 dark:text-violet-300",
			bar: "bg-violet-700",
			selected: "border-violet-700 ring-4 ring-violet-100 dark:ring-violet-900/40",
		},
	},
	"free-form": {
		label: "Recompensa avulsa",
		shortLabel: "AVULSA",
		icon: PenLine,
		balanceEffect: "− saldo",
		classes: {
			surface: "border-dashed border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-950/20",
			iconTile: "border border-dashed border-violet-400 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
			title: "text-violet-900 dark:text-violet-100",
			text: "text-violet-800 dark:text-violet-300",
			badge: "border-dashed border-violet-400 bg-background text-violet-800 dark:text-violet-300",
			amount: "text-violet-700 dark:text-violet-300",
			bar: "bg-violet-700",
			selected: "border-violet-700 ring-4 ring-violet-100 dark:ring-violet-900/40",
		},
	},
};

export function PoiOperationBadge({ kind, className }: { kind: TPoiOperationKind; className?: string }) {
	const meta = POI_OPERATION_KINDS[kind];
	const Icon = meta.icon;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold tracking-tight",
				meta.classes.badge,
				className,
			)}
		>
			<Icon className="h-3 w-3 min-h-3 min-w-3" />
			{meta.shortLabel}
		</span>
	);
}

/** Barra de saldo: quanto da operação sai do saldo disponível. */
export function PoiBalanceUsageBar({
	kind,
	used,
	available,
	className,
}: {
	kind: TPoiOperationKind;
	used: number;
	available: number;
	className?: string;
}) {
	const ratio = available > 0 ? Math.min(1, Math.max(0, used / available)) : used > 0 ? 1 : 0;
	return (
		<div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
			<div className={cn("h-full rounded-full transition-[width]", POI_OPERATION_KINDS[kind].classes.bar)} style={{ width: `${ratio * 100}%` }} />
		</div>
	);
}

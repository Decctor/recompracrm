import { cn } from "@/lib/utils";
import { DollarSign, type LucideIcon, Minus, Plus, Wallet } from "lucide-react";
import type { ReactNode } from "react";

// Peças compartilhadas pelas ilustrações estáticas das telas do app. Valores copiados dos
// componentes reais (HeaderApp, cards do PDV, checkout), não dos tokens de marketing.

export const MOCK_CARD = "rounded-[14px] border border-[#e3e8ea] bg-white shadow-[0_1px_rgba(0,0,0,0.05)]";
export const MOCK_WINDOW = "rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]";

type MockHeaderProps = {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
};

/** Cabeçalho de página do app (HeaderApp): ícone, título black e descrição recuada. */
export function MockHeader({ icon: Icon, title, description, action }: MockHeaderProps) {
	const heading = (
		<div className="flex items-center gap-2">
			<Icon className="size-5 flex-none" aria-hidden />
			<p className="m-0 text-[20px] font-black leading-none tracking-[-0.025em]">{title}</p>
		</div>
	);
	return (
		<header className="flex flex-col gap-0.5">
			{action ? (
				<div className="flex items-center justify-between">
					{heading}
					{action}
				</div>
			) : (
				heading
			)}
			{description ? <p className="m-0 pl-7 text-[12px] text-[#687a80]">{description}</p> : null}
		</header>
	);
}

/** Abas segmentadas cinza (Documentos / Pendências / Configuração). */
type MockSegmentedProps = {
	items: { label: string; badge?: string }[];
	active: string;
	className?: string;
};

export function MockSegmented({ items, active, className }: MockSegmentedProps) {
	return (
		<div className={cn("flex gap-0.5 rounded-[10px] bg-[#f2f4f4] p-[3px]", className)}>
			{items.map((item) => (
				<span
					key={item.label}
					className={cn(
						"inline-flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium",
						item.label === active ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#687a80]",
					)}
				>
					{item.label}
					{item.badge ? (
						<span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-[#e5252a] px-[5px] text-[10px] font-bold text-white">
							{item.badge}
						</span>
					) : null}
				</span>
			))}
		</div>
	);
}

export function SummaryTitle() {
	return (
		<div className="flex items-center gap-1.5">
			<DollarSign className="size-4 flex-none" aria-hidden />
			<span className="text-[12px] font-bold tracking-[0.025em]">RESUMO</span>
		</div>
	);
}

export function CashbackDiscountBox() {
	return (
		<div className="flex flex-col gap-1.5 rounded-[10px] border border-[rgba(255,185,0,0.35)] bg-[rgba(255,185,0,0.2)] p-2">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#ffb900]">
					<Wallet className="size-3 flex-none" aria-hidden />
					DESCONTO EM CASHBACK
				</span>
				<span className="text-[11px] font-semibold text-[#ffb900]">MAX: R$ 26,00</span>
			</div>
			<div className="flex items-center justify-between gap-2">
				<span className="flex h-9 w-28 items-center rounded-lg border border-[rgba(255,185,0,0.5)] bg-white px-3 text-[12px] font-bold text-[#ffb900]">
					20
				</span>
				<span className="inline-flex h-8 items-center rounded-full px-3 text-[14px] font-medium text-[#0e1214]">APLICAR MÁXIMO</span>
			</div>
		</div>
	);
}

type AdjustmentRowProps = {
	tone: "red" | "green";
	label: string;
	children?: ReactNode;
};

/** Linha de "Outros descontos" (vermelho) ou "Acréscimos" (verde) do resumo do checkout. */
export function AdjustmentRow({ tone, label, children }: AdjustmentRowProps) {
	const red = tone === "red";
	const Icon = red ? Minus : Plus;
	const row = (
		<div className="flex items-center justify-between">
			<span className={cn("flex items-center gap-1.5 text-[12px] font-semibold", red ? "text-[#dc2626]" : "text-[#15803d]")}>
				<Icon className="size-3 flex-none" aria-hidden />
				{label}
			</span>
			<span
				className={cn(
					"flex h-9 w-24 items-center rounded-lg border bg-white px-3 text-[12px] font-bold",
					red ? "border-[rgba(239,68,68,0.5)] text-[#dc2626]" : "border-[rgba(22,163,74,0.5)] text-[#15803d]",
				)}
			>
				0
			</span>
		</div>
	);
	const box = red ? "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)]" : "border-[rgba(22,163,74,0.3)] bg-[rgba(22,163,74,0.1)]";
	if (!children) return <div className={cn("rounded-[10px] border p-2", box)}>{row}</div>;
	return (
		<div className={cn("flex flex-col gap-1 rounded-[10px] border p-2", box)}>
			{row}
			{children}
		</div>
	);
}

/** Barra fixa com o total e o botão de finalizar (TotalDock). */
export function TotalDock({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 rounded-[14px] border border-[#e3e8ea] bg-white px-3 py-2 shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.45)]",
				className,
			)}
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<div className="flex items-baseline gap-1.5">
					<span className="text-[10px] font-bold tracking-[0.1em] text-[#687a80]">TOTAL</span>
					<span className="text-[20px] font-black tracking-[-0.025em]">R$ 91,90</span>
				</div>
				<span className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[#24549c] text-[14px] font-medium text-[#f5f9fd]">
					FINALIZAR VENDA
				</span>
			</div>
		</div>
	);
}

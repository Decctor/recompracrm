import { cn } from "@/lib/utils";
import { AlertCircle, CalendarClock, type LucideIcon, Timer, TrendingUp, Wallet } from "lucide-react";

// Fiados (app/dashboard/finance/store-credit), desenhado a 760px: os quatro StatCard do topo e o
// bloco "IDADE DA DÍVIDA" (store-credit-aging.tsx) com as faixas de lib/finances/store-credit/aging.ts.
// Valores hipotéticos: as faixas somam o total em aberto, e o vencido é a soma das faixas vencidas.

const CARDS: { label: string; icon: LucideIcon; tone: string; value: string; tag?: string; valueClassName?: string; delta?: string }[] = [
	{ label: "EM ABERTO", icon: Wallet, tone: "bg-[#bfdbfe] text-[#2563eb]", value: "R$ 6.842,50", tag: "38 CLIENTES" },
	{
		label: "VENCIDO",
		icon: AlertCircle,
		tone: "bg-[#fecaca] text-[#dc2626]",
		value: "R$ 1.926,30",
		tag: "11 CLIENTES",
		valueClassName: "text-[#dc2626]",
	},
	{ label: "RECEBIDO NO PERÍODO", icon: TrendingUp, tone: "bg-[#bbf7d0] text-[#16a34a]", value: "R$ 4.310,00", delta: "12,4%" },
	{ label: "PRAZO MÉDIO DE QUITAÇÃO", icon: Timer, tone: "bg-[#e9d5ff] text-[#9333ea]", value: "24,5 dias" },
];

const AGING = [
	{ label: "A vencer", value: "R$ 4.916,20", count: "27 títulos", share: 72, overdue: false },
	{ label: "Vencido 1-15 dias", value: "R$ 1.104,80", count: "6 títulos", share: 16, overdue: true },
	{ label: "Vencido 16-30 dias", value: "R$ 512,00", count: "3 títulos", share: 7.5, overdue: true },
	{ label: "Vencido +30 dias", value: "R$ 309,50", count: "2 títulos", share: 4.5, overdue: true },
];

export function StoreCreditMock() {
	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<p className="text-[12px] font-bold uppercase tracking-tight">FIADOS</p>
			<div className="grid grid-cols-2 gap-2">
				{CARDS.map((card) => (
					<div
						key={card.label}
						className="flex items-center justify-between gap-1 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
					>
						<div className="flex items-center gap-2">
							<span className={cn("flex size-7 items-center justify-center rounded-full p-1", card.tone)}>
								<card.icon className="size-4" />
							</span>
							<p className="text-[12px] font-medium leading-none tracking-tight">{card.label}</p>
						</div>
						<div className="flex items-center gap-2">
							<p className={cn("text-[14px] font-medium", card.valueClassName)}>{card.value}</p>
							{card.tag ? <span className="rounded-md bg-[#f5f5f5] px-1.5 py-0.5 text-[9.6px] font-medium text-[#687a80]">{card.tag}</span> : null}
							{card.delta ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-[#bbf7d0] px-1.5 py-0.5 text-[10.4px] font-bold text-[#15803d]">
									<TrendingUp className="size-3" />
									{card.delta}
								</span>
							) : null}
						</div>
					</div>
				))}
			</div>
			<div className="flex flex-col gap-3 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
				<div className="flex items-center gap-2">
					<CalendarClock className="size-4" />
					<p className="text-[12px] font-medium leading-none tracking-tight">IDADE DA DÍVIDA</p>
				</div>
				<div className="flex flex-col gap-2">
					{AGING.map((bucket) => (
						<div key={bucket.label} className="flex flex-col gap-1">
							<div className="flex items-center justify-between gap-2">
								<p className={cn("text-[12px] font-medium tracking-tight", bucket.overdue ? "text-[#b91c1c]" : "text-[#0e1214]")}>{bucket.label}</p>
								<div className="flex items-center gap-2">
									<span className="text-[10.4px] text-[#687a80]">{bucket.count}</span>
									<span className="text-[12px] font-medium">{bucket.value}</span>
								</div>
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-[#f5f5f5]">
								<div className={cn("h-full rounded-full", bucket.overdue ? "bg-[#ef4444]" : "bg-[#171717]")} style={{ width: `${bucket.share}%` }} />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

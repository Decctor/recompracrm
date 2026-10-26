import { cn } from "@/lib/utils";
import {
	BadgeDollarSign,
	Calendar,
	ChartNoAxesColumnIncreasing,
	CircleDot,
	type LucideIcon,
	MoveDown,
	MoveUp,
	TriangleAlert,
	Wallet,
} from "lucide-react";
import { MOCK_CARD, MOCK_WINDOW, MockHeader } from "./mock-parts";

// Visão geral do financeiro (finance/overview-page + stat-card + delta-badge), desenhada a 1040px.

type TIconTone = { bg: string; fg: string };

const TONE = {
	green: { bg: "bg-[#bbf7d0]", fg: "text-[#16a34a]" },
	orange: { bg: "bg-[#fed7aa]", fg: "text-[#ea580c]" },
	red: { bg: "bg-[#fecaca]", fg: "text-[#dc2626]" },
	blue: { bg: "bg-[#bfdbfe]", fg: "text-[#2563eb]" },
	brand: { bg: "bg-[rgba(36,84,156,0.2)]", fg: "text-[#0e1214]" },
} satisfies Record<string, TIconTone>;

const STATS: { label: string; value: string; icon: LucideIcon; tone: TIconTone; margin?: string; delta: string; good: boolean; up: boolean }[] = [
	{ label: "RECEITAS", value: "R$ 48.920,40", icon: MoveUp, tone: TONE.green, delta: "12,4%", good: true, up: true },
	{ label: "CUSTOS", value: "R$ 21.405,10", icon: MoveDown, tone: TONE.orange, delta: "4,1%", good: false, up: true },
	{ label: "DESPESAS", value: "R$ 9.850,00", icon: MoveDown, tone: TONE.red, delta: "3,2%", good: true, up: false },
	{ label: "RESULTADO", value: "R$ 17.665,30", icon: BadgeDollarSign, tone: TONE.blue, margin: "MARGEM 36,1%", delta: "18,7%", good: true, up: true },
];

const SIDE: { label: string; icon: LucideIcon; tone: TIconTone; value?: string; out?: string; in?: string }[] = [
	{ label: "RESULTADO LÍQUIDO", value: "R$ 17.665,30", icon: BadgeDollarSign, tone: TONE.brand },
	{ label: "TOTAL RECEBIDO", value: "R$ 44.310,90", icon: MoveUp, tone: TONE.green },
	{ label: "TOTAL PAGO", value: "R$ 27.902,15", icon: MoveUp, tone: TONE.red },
	{ label: "TRANSAÇÕES PENDENTES", icon: CircleDot, tone: TONE.blue, out: "R$ 3.420,00", in: "R$ 6.118,40" },
	{ label: "TRANSAÇÕES EM ATRASO", icon: TriangleAlert, tone: TONE.red, out: "R$ 0,00", in: "R$ 412,00" },
];

const BAR_MAX = 8000;
const BARS: { day: string; done: number; expected: number }[] = [
	{ day: "15/10", done: 5200, expected: 5600 },
	{ day: "16/10", done: 3900, expected: 4300 },
	{ day: "17/10", done: 6100, expected: 5800 },
	{ day: "18/10", done: 4700, expected: 5200 },
	{ day: "19/10", done: 6800, expected: 6500 },
	{ day: "20/10", done: 7400, expected: 7100 },
	{ day: "21/10", done: 3200, expected: 4100 },
	{ day: "22/10", done: 5600, expected: 6000 },
	{ day: "23/10", done: 0, expected: 6300 },
	{ day: "24/10", done: 0, expected: 4800 },
];

function StatIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: TIconTone }) {
	return (
		<span className={cn("flex size-7 flex-none items-center justify-center rounded-[14px]", tone.bg, tone.fg)}>
			<Icon className="size-4 flex-none" />
		</span>
	);
}

function StatLabel({ icon, tone, label }: { icon: LucideIcon; tone: TIconTone; label: string }) {
	return (
		<div className="flex items-center gap-2">
			<StatIcon icon={icon} tone={tone} />
			<span className="text-[12px] font-medium leading-none tracking-[-0.015em]">{label}</span>
		</div>
	);
}

export function FinanceOverviewMock() {
	return (
		<div className={cn("flex flex-col gap-4", MOCK_WINDOW)}>
			<div className="flex items-center justify-between">
				<MockHeader icon={Wallet} title="Financeiro" description="Visão geral de receitas, custos, despesas e movimentações." />
				<span className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[14px]">
					<Calendar className="size-4 flex-none" />
					01/10/2026 - 24/10/2026
				</span>
			</div>
			<div className="grid grid-cols-4 gap-2">
				{STATS.map((stat) => {
					const DeltaIcon = stat.up ? MoveUp : MoveDown;
					return (
						<div key={stat.label} className={cn("flex items-center justify-between gap-2 px-3 py-4", MOCK_CARD)}>
							<StatLabel icon={stat.icon} tone={stat.tone} label={stat.label} />
							<div className="flex flex-col items-end gap-1">
								<span className="whitespace-nowrap text-[14px] font-medium">{stat.value}</span>
								<span className="flex gap-1">
									{stat.margin ? (
										<span className="rounded-md bg-[rgba(34,197,94,0.1)] px-1.5 py-0.5 text-[9.6px] font-medium text-[#15803d]">{stat.margin}</span>
									) : null}
									<span
										className={cn(
											"flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9.6px] font-medium",
											stat.good ? "bg-[rgba(34,197,94,0.1)] text-[#15803d]" : "bg-[rgba(239,68,68,0.1)] text-[#b91c1c]",
										)}
									>
										<DeltaIcon className="size-2.5 flex-none" />
										{stat.delta}
									</span>
								</span>
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex gap-6">
				<div className="flex w-2/5 flex-col gap-2">
					{SIDE.map((item) => (
						<div key={item.label} className={cn("flex items-center justify-between gap-2 px-3 py-4", MOCK_CARD)}>
							<StatLabel icon={item.icon} tone={item.tone} label={item.label} />
							{item.value ? <span className="text-[14px] font-medium">{item.value}</span> : null}
							{item.out ? (
								<div className="flex gap-2">
									<span className="flex items-center gap-1 rounded-[10px] bg-[#fecaca] px-2 py-1 text-[10.4px] font-medium text-[#dc2626]">
										<MoveUp className="size-4 flex-none" />
										{item.out}
									</span>
									<span className="flex items-center gap-1 rounded-[10px] bg-[#bbf7d0] px-2 py-1 text-[10.4px] font-medium text-[#16a34a]">
										<MoveDown className="size-4 flex-none" />
										{item.in}
									</span>
								</div>
							) : null}
						</div>
					))}
				</div>
				<div className="flex flex-1 flex-col gap-3 rounded-[14px] border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
					<div className="flex items-center gap-2">
						<ChartNoAxesColumnIncreasing className="size-4 flex-none" />
						<span className="text-[12px] font-medium leading-none tracking-[-0.015em]">FLUXO DE TRANSAÇÕES</span>
					</div>
					<div className="grid min-h-[300px] flex-1 grid-cols-[44px_1fr] grid-rows-[1fr_auto]">
						<div className="flex flex-col items-end justify-between pr-2.5 text-[12px] text-[#687a80]">
							<span>8000</span>
							<span>6000</span>
							<span>4000</span>
							<span>2000</span>
							<span>0</span>
						</div>
						<div className="relative border-b border-l border-[#9aa6ab]">
							<div className="absolute inset-0 flex flex-col justify-between">
								<span className="h-px bg-[rgba(14,18,20,0.08)]" />
								<span className="h-px bg-[rgba(14,18,20,0.08)]" />
								<span className="h-px bg-[rgba(14,18,20,0.08)]" />
								<span className="h-px bg-[rgba(14,18,20,0.08)]" />
								<span className="h-0" />
							</div>
							<div className="absolute inset-0 grid grid-cols-10 items-end px-1.5">
								{BARS.map((bar) => (
									<div key={bar.day} className="flex h-full items-end justify-center gap-[3px]">
										<span className="block w-3 rounded-t bg-[#16a34a]" style={{ height: `${(bar.done / BAR_MAX) * 100}%` }} />
										<span className="block w-3 rounded-t bg-[#ca8a04]" style={{ height: `${(bar.expected / BAR_MAX) * 100}%` }} />
									</div>
								))}
							</div>
						</div>
						<span />
						<div className="grid grid-cols-10 px-1.5 pt-2 text-center text-[12px] text-[#687a80]">
							{BARS.map((bar) => (
								<span key={bar.day}>{bar.day}</span>
							))}
						</div>
					</div>
					<div className="flex justify-center gap-4 text-[12px]">
						<span className="inline-flex items-center gap-1.5">
							<span className="size-2 rounded-[2px] bg-[#16a34a]" />
							EFETIVADO
						</span>
						<span className="inline-flex items-center gap-1.5">
							<span className="size-2 rounded-[2px] bg-[#ca8a04]" />
							EXPECTATIVA
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

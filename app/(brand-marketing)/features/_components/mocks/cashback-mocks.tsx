import { cn } from "@/lib/utils";
import { BadgeDollarSign, Check, ChevronDown, CirclePlus, Clock, MapPin, Pause, Percent, PiggyBank, ShoppingCart, UsersRound } from "lucide-react";
import { MUTED, MockCard, StatUnit, type TStatUnit } from "./mock-parts";

// Telas do programa de cashback (growth/cashback/_components/program/*, Modals/CashbackPrograms/Blocks/*,
// CashbackStatsBlock).

const PROGRAM_STATS: TStatUnit[] = [
	{ title: "Cashback Gerado", icon: CirclePlus, value: "R$ 4.812,40", prev: "R$ 4.406,90", delta: "+9,2%" },
	{ title: "Cashback Resgatado", icon: BadgeDollarSign, value: "R$ 2.936,10", prev: "R$ 2.561,30", delta: "+14,6%" },
	{ title: "Taxa de Resgate", icon: Percent, value: "61,0%", prev: "58,1%", delta: "+5,0%" },
	{ title: "Cashback Expirando", icon: Clock, value: "R$ 642,80", prev: "R$ 665,40", delta: "−3,4%" },
];

const PROGRAM_TABS = ["MEU PROGRAMA", "SALDOS", "TRANSAÇÕES", "RECOMPENSAS"];

/** Herói do cashback: a página "Meu programa" com o resumo e os indicadores do período. */
export function CashbackProgramMock() {
	return (
		<MockCard className="gap-4 p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-[1_1_240px]">
					<div className="flex flex-wrap items-center gap-2">
						<p className="m-0 text-[20px] font-extrabold tracking-[-0.025em]">Programa Fidelidade Aurora</p>
						<span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-[#15803d]">
							<Check className="size-3" aria-hidden />
							ATIVO
						</span>
					</div>
					<p className={cn("m-0 mt-1.5 text-[13px] leading-[1.5]", MUTED)}>
						Cliente ganha 5% de cada venda acima de R$ 20,00, válido por 90 dias. Resgata como desconto de até 30% da compra ou em recompensas.
					</p>
				</div>
				<span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e3e8ea] bg-[#f7f9f9] px-3 text-[12px] font-medium whitespace-nowrap">
					<Pause className="size-3.5" aria-hidden />
					PAUSAR PROGRAMA
				</span>
			</div>
			<div className="flex flex-wrap gap-0.5 self-start rounded-[10px] bg-[#f2f4f4] p-[3px]">
				{PROGRAM_TABS.map((tab, i) => (
					<span
						key={tab}
						className={cn(
							"inline-flex h-7 items-center px-2.5 text-[12px]",
							i === 0 ? "rounded-lg bg-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : cn("font-medium", MUTED),
						)}
					>
						{tab}
					</span>
				))}
			</div>
			<div className="grid grid-cols-2 gap-2">
				{PROGRAM_STATS.map((stat) => (
					<StatUnit key={stat.title} {...stat} />
				))}
			</div>
		</MockCard>
	);
}

const ACCUMULATION_FIELDS = [
	{ label: "TIPO DE ACUMULAÇÃO", value: "Percentual", select: true },
	{ label: "VALOR DE ACUMULAÇÃO (R$)", value: "5" },
	{ label: "VALOR MÍNIMO P/ ACÚMULO", value: "R$ 20,00" },
	{ label: "VALIDADE (DIAS)", value: "90" },
];

const REDEMPTION_SURFACES = [
	{ label: "PERMITIR RESGATES PELO PDV", on: true },
	{ label: "PERMITIR RESGATES PELO PONTO DE INTERAÇÃO", on: true },
	{ label: "PERMITIR RESGATES PELA LOJA DIGITAL", on: false },
];

/** Blocos "Acúmulo e validade" e "Onde o cliente pode resgatar" do editor do programa. */
export function AccumulationSettingsMock() {
	return (
		<MockCard className="gap-3 p-4">
			<div className="flex flex-col gap-4 rounded-xl border border-[#e3e8ea] px-3 py-4">
				<p className="m-0 flex items-center gap-2 text-[12px] font-bold tracking-[-0.01em]">
					<PiggyBank className="size-4" aria-hidden />
					ACÚMULO E VALIDADE
				</p>
				<div className="grid grid-cols-2 gap-3">
					{ACCUMULATION_FIELDS.map((field) => (
						<div key={field.label} className="flex min-w-0 flex-col gap-1.5">
							<span className={cn("truncate text-[11px] font-semibold", MUTED)}>{field.label}</span>
							<span className="flex h-9 items-center justify-between rounded-lg border border-[#e3e8ea] px-3 text-[14px]">
								{field.value}
								{field.select ? <ChevronDown className="size-3.5 flex-none text-[#687a80]" aria-hidden /> : null}
							</span>
						</div>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-3 rounded-xl border border-[#e3e8ea] px-3 py-4">
				<p className="m-0 flex items-center gap-2 text-[12px] font-bold tracking-[-0.01em]">
					<MapPin className="size-4" aria-hidden />
					ONDE O CLIENTE PODE RESGATAR
				</p>
				{REDEMPTION_SURFACES.map((surface) => (
					<span key={surface.label} className="flex items-center gap-2.5 text-[12px] font-semibold">
						<span
							className={cn("flex size-4 flex-none items-center justify-center rounded", surface.on ? "bg-[#24549c] text-white" : "border border-[#c9d1d4]")}
						>
							{surface.on ? <Check className="size-[11px]" aria-hidden /> : null}
						</span>
						{surface.label}
					</span>
				))}
			</div>
			<div className="flex items-center justify-end gap-2">
				<span className={cn("inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium", MUTED)}>DESCARTAR</span>
				<span className="inline-flex h-8 items-center rounded-full bg-[#24549c] px-3.5 text-[12px] font-medium text-white">APLICAR</span>
			</div>
		</MockCard>
	);
}

const SALES_STATS: TStatUnit[] = [
	{ title: "Nº vendas com cashback", icon: ShoppingCart, value: "1.046", prev: "962", delta: "+8,7%", share: "48,3%" },
	{
		title: "Valor vendido com cashback",
		icon: BadgeDollarSign,
		value: "R$ 100.840,00",
		prev: "R$ 91.120,00",
		delta: "+10,7%",
		share: "55,3%",
	},
];

const CHART_MONTHS = ["mai", "jun", "jul", "ago", "set", "out"];

/** Relatório do programa: vendas com cashback e a curva de cashback gerado. */
export function CashbackReportMock() {
	return (
		<MockCard className="gap-2.5 p-4">
			<div className="grid grid-cols-2 gap-2">
				{SALES_STATS.map((stat) => (
					<StatUnit key={stat.title} {...stat} />
				))}
			</div>
			<div className="flex flex-col gap-3 rounded-xl border border-[#e3e8ea] px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
				<div className="flex items-center justify-between gap-2">
					<span className="text-[12px] font-medium tracking-[-0.01em]">CASHBACK GERADO</span>
					<div className="flex gap-1.5">
						<span className="flex rounded-lg p-2 text-[#0e1214]">
							<UsersRound className="size-4" aria-hidden />
						</span>
						<span className="flex rounded-lg bg-[#24549c] p-2 text-white">
							<CirclePlus className="size-4" aria-hidden />
						</span>
						<span className="flex rounded-lg p-2 text-[#0e1214]">
							<BadgeDollarSign className="size-4" aria-hidden />
						</span>
					</div>
				</div>
				<svg viewBox="0 0 400 170" preserveAspectRatio="none" className="block h-[190px] w-full" aria-hidden>
					<defs>
						<linearGradient id="feature-cashback-generated" x1="0" y1="0" x2="0" y2="1">
							<stop offset="10%" stopColor="#FFB900" stopOpacity={0.9} />
							<stop offset="90%" stopColor="#FFB900" stopOpacity={0.1} />
						</linearGradient>
					</defs>
					<g stroke="#e3e8ea" strokeWidth={1}>
						<line x1={40} y1={10} x2={400} y2={10} />
						<line x1={40} y1={50} x2={400} y2={50} />
						<line x1={40} y1={90} x2={400} y2={90} />
						<line x1={40} y1={130} x2={400} y2={130} />
					</g>
					<path
						d="M40 120 C70 112 90 104 120 100 S170 92 200 78 S250 70 280 56 S340 38 400 24 L400 150 L40 150 Z"
						fill="url(#feature-cashback-generated)"
					/>
					<path d="M40 120 C70 112 90 104 120 100 S170 92 200 78 S250 70 280 56 S340 38 400 24" fill="none" stroke="#FFB900" strokeWidth={2} />
					<g fill="#FFB900" fontSize={9} fontFamily="Outfit, sans-serif" textAnchor="end">
						<text x={34} y={13}>
							R$ 6k
						</text>
						<text x={34} y={53}>
							R$ 4,5k
						</text>
						<text x={34} y={93}>
							R$ 3k
						</text>
						<text x={34} y={133}>
							R$ 1,5k
						</text>
					</g>
				</svg>
				<div className={cn("flex justify-between pl-10 text-[10px]", MUTED)}>
					{CHART_MONTHS.map((month) => (
						<span key={month}>{month}</span>
					))}
				</div>
			</div>
		</MockCard>
	);
}

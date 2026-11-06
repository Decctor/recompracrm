import { cn } from "@/lib/utils";
import {
	ArrowRightLeft,
	BadgeDollarSign,
	CalendarDays,
	Layers2,
	type LucideIcon,
	Package,
	ReceiptText,
	TrendingDown,
	TrendingUp,
	Wallet,
} from "lucide-react";

// Visão geral do financeiro (app/dashboard/finance/overview-page.tsx), desenhada a 1040px: a seção
// "Resumo" (quatro StatUnitCard com o período anterior e a sparkline de 12 meses) e a "Resultado"
// (result-waterfall.tsx: resultado operacional, margens e a cascata do faturamento ao resultado, nas
// cores de FINANCE_COLORS). Mês hipotético de uma gelateria: R − C − D fecha com o resultado.

const COLORS = { inflow: "#16a34a", outflow: "#dc2626", subtotal: "#24549c" };

type TCard = {
	title: string;
	subtitle: string;
	icon: LucideIcon;
	value: string;
	previous: string;
	change: string;
	good: boolean;
	spark: number[];
};

const CARDS: TCard[] = [
	{
		title: "Receitas",
		subtitle: "Receita bruta por competência",
		icon: BadgeDollarSign,
		value: "R$ 86.420,00",
		previous: "R$ 79.310,00",
		change: "9%",
		good: true,
		spark: [61, 58, 64, 66, 70, 68, 72, 75, 71, 78, 79, 86],
	},
	{
		title: "Custos",
		subtitle: "Custos por competência",
		icon: Package,
		value: "R$ 31.870,00",
		previous: "R$ 30.120,00",
		change: "5,8%",
		good: false,
		spark: [24, 23, 25, 26, 27, 26, 28, 29, 28, 30, 30, 32],
	},
	{
		title: "Despesas",
		subtitle: "Despesas operacionais",
		icon: ReceiptText,
		value: "R$ 28.940,00",
		previous: "R$ 27.650,00",
		change: "4,7%",
		good: false,
		spark: [25, 26, 25, 26, 27, 27, 26, 28, 27, 28, 28, 29],
	},
	{
		title: "Caixa líquido",
		subtitle: "Recebido − pago no período",
		icon: ArrowRightLeft,
		value: "R$ 21.380,00",
		previous: "R$ 18.540,00",
		change: "15,3%",
		good: true,
		spark: [9, 7, 11, 12, 14, 12, 15, 16, 13, 17, 19, 21],
	},
];

// Cascata em milhares: receita 86,42 → custos 31,87 → lucro bruto 54,55 → despesas 28,94 → resultado 25,61.
// Período anterior: 79,31 / 30,12 / 49,19 / 27,65 / 21,54. Domínio 0–100 mil, como o niceDomain do app.
const STEPS = [
	{ name: "Receita bruta", a: 0, b: 86.42, pa: 0, pb: 79.31, color: COLORS.inflow, label: "R$ 86,4 mil", share: "100%" },
	{ name: "(−) Custos", a: 54.55, b: 86.42, pa: 49.19, pb: 79.31, color: COLORS.outflow, label: "-R$ 31,9 mil", share: "36,9%" },
	{ name: "(=) Lucro bruto", a: 0, b: 54.55, pa: 0, pb: 49.19, color: COLORS.subtotal, label: "R$ 54,6 mil", share: "63,1%" },
	{ name: "(−) Despesas", a: 25.61, b: 54.55, pa: 21.54, pb: 49.19, color: COLORS.outflow, label: "-R$ 28,9 mil", share: "33,5%" },
	{ name: "(=) Resultado", a: 0, b: 25.61, pa: 0, pb: 21.54, color: COLORS.subtotal, label: "R$ 25,6 mil", share: "29,6%" },
];
const TICKS = [0, 25, 50, 75, 100];

function Sparkline({ values }: { values: number[] }) {
	const max = Math.max(...values);
	const min = Math.min(...values);
	const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${100 - ((value - min) / (max - min || 1)) * 100}`).join(" ");
	return (
		<div className="mt-2 flex items-end gap-2 border-t border-dashed border-[#e3e8ea] pt-2.5">
			<div className="relative h-7 flex-1">
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
					<polyline points={points} fill="none" stroke={COLORS.subtotal} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
				</svg>
				<span
					className="absolute top-0 right-0 size-[7px] -translate-y-1/2 translate-x-1/2 rounded-full shadow-[0_0_0_2px_#fff]"
					style={{ background: COLORS.subtotal }}
				/>
			</div>
			<span className="text-[9.6px] font-semibold uppercase leading-none tracking-wide text-[#687a80]">12M</span>
		</div>
	);
}

function SectionTitle({
	icon: Icon,
	title,
	description,
	actions,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
	actions?: React.ReactNode;
}) {
	return (
		<div className="flex items-end justify-between gap-2">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-1.5">
					<Icon className="size-4 text-[#687a80]" />
					<p className="text-[12px] font-bold uppercase tracking-wide">{title}</p>
				</div>
				<p className="text-[12px] text-[#687a80]">{description}</p>
			</div>
			{actions}
		</div>
	);
}

export function FinanceOverviewMock() {
	return (
		<div className="flex flex-col gap-8 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<section className="flex flex-col gap-3">
				<SectionTitle
					icon={Wallet}
					title="Resumo"
					description="Outubro de 2026, comparado ao período anterior de mesma duração (31/08 – 30/09)."
					actions={
						<span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e3e8ea] px-3 text-[12px] font-medium">
							<CalendarDays className="size-3.5" />
							01/10/2026 – 31/10/2026
						</span>
					}
				/>
				<div className="grid grid-cols-4 gap-3">
					{CARDS.map((card) => (
						<div key={card.title} className="flex flex-col gap-1 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
							<div className="flex items-start justify-between gap-2">
								<div className="flex flex-col gap-0.5">
									<p className="text-[12px] font-medium uppercase tracking-tight">{card.title}</p>
									<p className="text-[10.4px] text-[#687a80]">{card.subtitle}</p>
								</div>
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.4px] font-bold",
											card.good ? "bg-[#bbf7d0] text-[#15803d]" : "bg-[#fecaca] text-[#b91c1c]",
										)}
									>
										{card.good ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
										{card.change}
									</span>
									<card.icon className="size-4 flex-none" />
								</div>
							</div>
							<p className="text-[24px] font-bold text-[#24549c]">{card.value}</p>
							<p className="text-[12px] tracking-tight text-[#687a80]">NO PERÍODO ANTERIOR: {card.previous}</p>
							<Sparkline values={card.spark} />
						</div>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionTitle icon={Layers2} title="Resultado" description="Do faturamento ao resultado operacional, por competência." />
				<div className="flex gap-8 rounded-xl border border-[#e3e8ea] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
					<div className="flex w-[280px] flex-none flex-col gap-3.5">
						<div className="flex items-center gap-2">
							<span className="flex size-7 items-center justify-center rounded-full bg-[rgba(23,23,23,0.2)]">
								<BadgeDollarSign className="size-4" />
							</span>
							<span className="text-[12px] font-medium uppercase leading-none tracking-tight">Resultado operacional</span>
						</div>
						<p className="text-[32px] font-bold leading-none text-[#24549c]">R$ 25.610,00</p>
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="rounded-md bg-[#eafaf0] px-1.5 py-0.5 text-[11px] font-semibold text-[#15803d]">MARGEM 29,6%</span>
							<span className="inline-flex items-center gap-1 rounded-md bg-[#bbf7d0] px-1.5 py-0.5 text-[10.4px] font-bold text-[#15803d]">
								<TrendingUp className="size-3" />
								18,9%
							</span>
							<span className="text-[12px] text-[#687a80]">vs. R$ 21.540,00</span>
						</div>
						<div className="h-px bg-[#e3e8ea]" />
						<div className="grid grid-cols-2 gap-3">
							{[
								{ label: "MARGEM BRUTA", value: "63,1%", delta: "+1,1 p.p. vs. anterior" },
								{ label: "MARGEM OPERACIONAL", value: "29,6%", delta: "+2,4 p.p. vs. anterior" },
							].map((margin) => (
								<div key={margin.label} className="flex flex-col gap-1">
									<span className="text-[9.6px] font-semibold uppercase tracking-wide text-[#687a80]">{margin.label}</span>
									<span className="text-[20px] font-bold leading-tight">{margin.value}</span>
									<span className="text-[11px] font-semibold text-[#15803d]">{margin.delta}</span>
								</div>
							))}
						</div>
					</div>
					<div className="flex min-w-0 flex-1 flex-col">
						<div className="flex items-center justify-between gap-3">
							<span className="text-[12px] font-medium uppercase leading-none tracking-tight">Do faturamento ao resultado</span>
							<div className="flex items-center gap-3.5 text-[12px] text-[#687a80]">
								{[
									{ label: "Receita", color: COLORS.inflow },
									{ label: "Deduções", color: COLORS.outflow },
									{ label: "Subtotal", color: COLORS.subtotal },
									{ label: "Período anterior", color: "#e3e8ea" },
								].map((legend) => (
									<span key={legend.label} className="flex items-center gap-1.5">
										<span className="size-2.5 rounded-[3px]" style={{ background: legend.color }} />
										{legend.label}
									</span>
								))}
							</div>
						</div>
						<div className="relative mt-[30px] ml-[68px] h-60">
							{TICKS.map((tick) => (
								<div key={tick} className="absolute inset-x-0 border-t border-dashed border-[#e3e8ea]" style={{ bottom: `${tick}%` }}>
									<span className="absolute top-[-7px] right-full mr-2 whitespace-nowrap text-[11px] text-[#687a80]">
										{tick === 0 ? "R$ 0" : `R$ ${tick} mil`}
									</span>
								</div>
							))}
							{STEPS.map((step, index) => (
								<div
									key={`ghost-${step.name}`}
									className="absolute rounded-[4px] bg-[#e3e8ea]"
									style={{ left: `${index * 20 + 3.5}%`, width: "9%", bottom: `${Math.min(step.pa, step.pb)}%`, height: `${Math.abs(step.pb - step.pa)}%` }}
								/>
							))}
							{STEPS.map((step, index) => (
								<div
									key={step.name}
									className="absolute rounded-md"
									style={{
										left: `${index * 20 + 8}%`,
										width: "9%",
										bottom: `${Math.min(step.a, step.b)}%`,
										height: `${Math.abs(step.b - step.a)}%`,
										background: step.color,
									}}
								>
									<span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-[12px] font-bold">{step.label}</span>
								</div>
							))}
						</div>
						<div className="ml-[68px] grid grid-cols-5 border-t border-[#e3e8ea] pt-2">
							{STEPS.map((step) => (
								<div key={step.name} className="flex flex-col items-center gap-0.5 px-1 text-center">
									<span className="text-[12px] font-semibold">{step.name}</span>
									<span className="text-[11px] text-[#687a80]">{step.share}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}

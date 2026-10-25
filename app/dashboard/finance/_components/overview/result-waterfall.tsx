"use client";

import { BadgeDollarSign } from "lucide-react";
import type { TGetFinancesDreOutput } from "@/app/api/finances/analytics/dre/route";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { niceDomain } from "@/lib/charts/geometry";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { FINANCE_COLORS, LegendSwatch, formatCompactMoney, formatPercent, formatPointsDelta } from "../finance-chart-kit";
import { ChangeBadge } from "./change-badge";

type TDemonstrativo = TGetFinancesDreOutput["data"]["demonstrativo"];

const BAR_WIDTH = 9;

/** Resultado operacional em destaque + cascata receita → custos → lucro bruto → despesas → resultado. */
export function ResultWaterfall({ demonstrativo }: { demonstrativo: TDemonstrativo }) {
	const { colors } = useOrgColors();
	const R = demonstrativo.receita.total;
	const Rp = demonstrativo.receita.totalAnterior;
	const C = demonstrativo.custos.total;
	const Cp = demonstrativo.custos.totalAnterior;
	const E = demonstrativo.despesas.total;
	const Ep = demonstrativo.despesas.totalAnterior;
	const G = R - C;
	const Gp = Rp - Cp;
	const O = G - E;
	const Op = Gp - Ep;

	const steps = [
		{ name: "Receita bruta", a: 0, b: R, pa: 0, pb: Rp, color: FINANCE_COLORS.inflow, value: R },
		{ name: "(−) Custos", a: G, b: R, pa: Gp, pb: Rp, color: FINANCE_COLORS.outflow, value: -C },
		{ name: "(=) Lucro bruto", a: 0, b: G, pa: 0, pb: Gp, color: FINANCE_COLORS.subtotal, value: G },
		{ name: "(−) Despesas", a: O, b: G, pa: Op, pb: Gp, color: FINANCE_COLORS.outflow, value: -E },
		{ name: "(=) Resultado", a: 0, b: O, pa: 0, pb: Op, color: FINANCE_COLORS.subtotal, value: O },
	];
	// Resultado negativo desce abaixo do zero: o domínio inclui o menor nível da cascata.
	const domain = niceDomain(Math.min(0, G, Gp, O, Op), Math.max(R, Rp, 1) * 1.12, 4, { includeZero: true });
	const span = domain.max - domain.min || 1;
	const toPct = (value: number) => ((value - domain.min) / span) * 100;
	const barLeft = (index: number) => index * 20 + 8;
	const connectorLevels = [R, G, G, O];

	const grossMargin = R > 0 ? (G / R) * 100 : null;
	const grossMarginPrev = Rp > 0 ? (Gp / Rp) * 100 : null;
	const opMargin = R > 0 ? (O / R) * 100 : null;
	const opMarginPrev = Rp > 0 ? (Op / Rp) * 100 : null;
	const margins = [
		{ label: "MARGEM BRUTA", current: grossMargin, previous: grossMarginPrev },
		{ label: "MARGEM OPERACIONAL", current: opMargin, previous: opMarginPrev },
	];

	return (
		<div className="bg-card border-border flex flex-wrap gap-8 rounded-xl border p-4 shadow-2xs">
			<div className="flex min-w-[240px] flex-[0_1_300px] flex-col gap-3.5">
				<div className="flex items-center gap-2">
					<div className="bg-primary/20 flex size-7 items-center justify-center rounded-full">
						<BadgeDollarSign className="size-4" />
					</div>
					<span className="text-xs font-medium uppercase leading-none tracking-tight">Resultado operacional</span>
				</div>
				<div
					className={cn("text-[2rem] font-bold leading-none tabular-nums", O < 0 && "text-red-700")}
					style={O < 0 ? undefined : { color: colors.secondary }}
				>
					{formatToMoney(O)}
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					{opMargin !== null ? (
						<span
							className={cn(
								"whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
								opMargin >= 0 ? "bg-[#eafaf0] text-green-700" : "bg-[#fdecec] text-red-700",
							)}
						>
							MARGEM {formatPercent(opMargin)}
						</span>
					) : null}
					<ChangeBadge current={O} previous={Op} />
					<span className="text-muted-foreground text-xs">vs. {formatToMoney(Op)}</span>
				</div>
				<div className="bg-border h-px" />
				<div className="grid grid-cols-2 gap-3">
					{margins.map((margin) => (
						<div key={margin.label} className="flex flex-col gap-1">
							<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{margin.label}</span>
							<span className="text-xl font-bold leading-tight tabular-nums">{margin.current !== null ? formatPercent(margin.current) : "—"}</span>
							{margin.current !== null && margin.previous !== null ? (
								<span className={cn("text-[11px] font-semibold", margin.current >= margin.previous ? "text-green-700" : "text-red-700")}>
									{formatPointsDelta(margin.current, margin.previous)} vs. anterior
								</span>
							) : (
								<span className="text-muted-foreground text-[11px]">Sem base anterior</span>
							)}
						</div>
					))}
				</div>
			</div>

			<div className="min-w-0 flex-[1_1_460px] overflow-x-auto overflow-y-hidden">
				<div className="flex min-w-[480px] flex-col">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="text-xs font-medium uppercase leading-none tracking-tight">Do faturamento ao resultado</span>
						<div className="text-muted-foreground flex items-center gap-3.5 text-xs">
							<span className="flex items-center gap-1.5">
								<LegendSwatch color={FINANCE_COLORS.inflow} />
								Receita
							</span>
							<span className="flex items-center gap-1.5">
								<LegendSwatch color={FINANCE_COLORS.outflow} />
								Deduções
							</span>
							<span className="flex items-center gap-1.5">
								<LegendSwatch color={FINANCE_COLORS.subtotal} />
								Subtotal
							</span>
							<span className="flex items-center gap-1.5">
								<LegendSwatch className="bg-border" />
								Período anterior
							</span>
						</div>
					</div>
					<div className="relative ml-[68px] mt-[30px] h-60">
						{domain.ticks.map((tick) => (
							<div key={tick} className="border-border absolute inset-x-0 border-t border-dashed" style={{ bottom: `${toPct(tick)}%` }}>
								<span className="text-muted-foreground absolute right-full top-[-7px] mr-2 whitespace-nowrap text-[11px] tabular-nums">
									{formatCompactMoney(tick)}
								</span>
							</div>
						))}
						{steps.map((step, index) => (
							<div
								key={`ghost-${step.name}`}
								className="bg-border absolute rounded-[4px]"
								style={{
									left: `${index * 20 + 3.5}%`,
									width: "3.5%",
									bottom: `${toPct(Math.min(step.pa, step.pb))}%`,
									height: `${(Math.abs(step.pb - step.pa) / span) * 100}%`,
								}}
							/>
						))}
						{connectorLevels.map((level, index) => (
							<div
								key={`connector-${index}`}
								className="border-muted-foreground/60 absolute border-t border-dashed"
								style={{ left: `${barLeft(index) + BAR_WIDTH}%`, width: `${barLeft(index + 1) - barLeft(index) - BAR_WIDTH}%`, bottom: `${toPct(level)}%` }}
							/>
						))}
						{steps.map((step, index) => (
							<div
								key={step.name}
								className="absolute rounded-md"
								style={{
									left: `${barLeft(index)}%`,
									width: `${BAR_WIDTH}%`,
									bottom: `${toPct(Math.min(step.a, step.b))}%`,
									height: `${(Math.abs(step.b - step.a) / span) * 100}%`,
									background: step.color,
								}}
							>
								<span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums">
									{formatCompactMoney(step.value)}
								</span>
							</div>
						))}
					</div>
					<div className="border-border ml-[68px] grid grid-cols-5 border-t pt-2">
						{steps.map((step) => (
							<div key={step.name} className="flex flex-col items-center gap-0.5 px-1 text-center">
								<span className="text-xs font-semibold">{step.name}</span>
								<span className="text-muted-foreground text-[11px]">{R > 0 ? formatPercent((Math.abs(step.value) / R) * 100) : "—"}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

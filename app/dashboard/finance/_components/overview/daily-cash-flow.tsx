"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import type { TGetFinancesOverallStatsOutput } from "@/app/api/finances/stats/route";
import { formatToMoney } from "@/lib/formatting";
import {
	AccentStat,
	FINANCE_COLORS,
	LegendSwatch,
	TooltipRows,
	formatCompactMoney,
	getColumnTooltipPosition,
	hatchedBackground,
} from "../finance-chart-kit";

type TStats = TGetFinancesOverallStatsOutput["data"];

/**
 * Fluxo diário do período: entradas para cima, saídas para baixo. Até hoje, o efetivado; depois de
 * hoje, o previsto (hachurado). Pendências vencidas não entram aqui — ficam no quadro de pendências.
 */
export function DailyCashFlow({ stats, periodAfter }: { stats: TStats; periodAfter: Date }) {
	const [hovered, setHovered] = useState<number | null>(null);
	const today = dayjs().startOf("day");
	const start = dayjs(periodAfter).startOf("day");

	const days = stats.daily.map((day, index) => {
		const date = start.add(index, "day");
		const future = date.isAfter(today);
		return {
			date,
			future,
			inflow: future ? day.entradasPrevistas : day.entradasEfetivadas,
			outflow: future ? day.saidasPrevistas : day.saidasEfetivadas,
		};
	});
	const count = Math.max(days.length, 1);
	const maxIn = Math.max(0, ...days.map((day) => day.inflow));
	const maxOut = Math.max(0, ...days.map((day) => day.outflow));
	const total = (maxIn + maxOut) * 1.08 || 1;
	const zero = maxIn + maxOut > 0 ? ((maxIn * 1.04) / total) * 100 : 50;

	const grid = [
		{ value: maxIn, top: zero - (maxIn / total) * 100 },
		{ value: maxIn / 2, top: zero - (maxIn / 2 / total) * 100 },
		{ value: 0, top: zero },
		{ value: -maxOut / 2, top: zero + (maxOut / 2 / total) * 100 },
		{ value: -maxOut, top: zero + (maxOut / total) * 100 },
	]
		// Sem saídas (ou sem entradas) as linhas colapsam no zero: uma por altura, e −0 vira 0.
		.filter((line, index, all) => all.findIndex((other) => other.top === line.top) === index)
		.map((line) => ({ ...line, value: line.value || 0 }));

	const tickStep = Math.max(1, Math.round(count / 6));
	const ticks = days.filter((_, index) => index === 0 || index === count - 1 || (index % tickStep === 0 && count - 1 - index >= tickStep / 2));
	const todayIndex = days.findIndex((day) => day.date.isSame(today, "day"));

	const futureDays = days.filter((day) => day.future);
	const forecastNet = futureDays.reduce((sum, day) => sum + day.inflow - day.outflow, 0);
	const received = stats.totalInFlow;
	const paid = stats.totalOutFlow;
	const accentStats = [
		{ label: "RECEBIDO", value: formatToMoney(received), color: FINANCE_COLORS.inflow },
		{ label: "PAGO", value: formatToMoney(paid), color: FINANCE_COLORS.outflow },
		{ label: "SALDO EFETIVADO", value: formatToMoney(received - paid), color: FINANCE_COLORS.subtotal },
		...(futureDays.length > 0
			? [
					{
						label: `PREVISTO ${futureDays[0]?.date.format("DD/MM")}–${futureDays[futureDays.length - 1]?.date.format("DD/MM")}`,
						value: formatToMoney(forecastNet),
						color: "var(--color-border)",
					},
				]
			: []),
	];

	const hoveredDay = hovered !== null ? days[hovered] : null;
	const tooltipPosition = hovered !== null ? getColumnTooltipPosition(hovered, count) : null;

	return (
		<div className="bg-card border-border flex min-w-0 flex-[2_1_560px] flex-col gap-4 rounded-xl border px-4 pb-3 pt-4 shadow-2xs">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<ChartNoAxesColumnIncreasing className="size-4" />
						<span className="text-xs font-medium uppercase leading-none tracking-tight">Fluxo de caixa diário</span>
					</div>
					<span className="text-muted-foreground text-xs">Efetivado até hoje, previsto até o fim do período</span>
				</div>
				<div className="text-muted-foreground flex items-center gap-3.5 text-xs">
					<span className="flex items-center gap-1.5">
						<LegendSwatch color={FINANCE_COLORS.inflow} />
						Entradas
					</span>
					<span className="flex items-center gap-1.5">
						<LegendSwatch color={FINANCE_COLORS.outflow} />
						Saídas
					</span>
					<span className="flex items-center gap-1.5">
						<LegendSwatch background="repeating-linear-gradient(135deg, var(--color-muted-foreground) 0 2px, var(--color-border) 2px 4px)" />
						Previsto
					</span>
				</div>
			</div>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
				{accentStats.map((stat) => (
					<AccentStat key={stat.label} label={stat.label} value={stat.value} color={stat.color} />
				))}
			</div>
			<div className="relative ml-14 mt-3.5 h-[220px]" onMouseLeave={() => setHovered(null)}>
				{grid.map((line) => (
					<div
						key={line.top}
						className={`border-border absolute inset-x-0 border-t ${line.value === 0 ? "border-solid" : "border-dashed"}`}
						style={{ top: `${line.top}%` }}
					>
						<span className="text-muted-foreground absolute right-full top-[-7px] mr-2 whitespace-nowrap text-[11px] tabular-nums">
							{formatCompactMoney(line.value)}
						</span>
					</div>
				))}
				{days.map((day, index) => (
					<div
						key={day.date.format("YYYY-MM-DD")}
						onMouseEnter={() => setHovered(index)}
						className="absolute inset-y-0 rounded-[4px]"
						style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%`, background: hovered === index ? "rgba(0,0,0,0.04)" : "transparent" }}
					>
						<div
							className="absolute inset-x-[18%] rounded-t-[3px]"
							style={{
								top: `${zero - (day.inflow / total) * 100}%`,
								height: `${(day.inflow / total) * 100}%`,
								background: day.future ? hatchedBackground(FINANCE_COLORS.inflowRgb) : FINANCE_COLORS.inflow,
							}}
						/>
						<div
							className="absolute inset-x-[18%] rounded-b-[3px]"
							style={{
								top: `${zero}%`,
								height: `${(day.outflow / total) * 100}%`,
								background: day.future ? hatchedBackground(FINANCE_COLORS.outflowRgb) : FINANCE_COLORS.outflow,
							}}
						/>
					</div>
				))}
				{todayIndex >= 0 ? (
					<div
						className="border-primary pointer-events-none absolute -top-4 bottom-0 border-l border-dashed"
						style={{ left: `${((todayIndex + 1) / count) * 100}%` }}
					>
						<span className="text-primary absolute left-[5px] top-0 text-[10px] font-extrabold tracking-[0.08em]">HOJE</span>
					</div>
				) : null}
				{hoveredDay && tooltipPosition ? (
					<div
						className="bg-popover text-popover-foreground border-border pointer-events-none absolute top-1 z-[3] flex min-w-[180px] flex-col gap-1.5 rounded-[10px] border px-2.5 py-2 shadow-[0_12px_24px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)]"
						style={{ left: `${tooltipPosition.left}%`, transform: `translateX(${tooltipPosition.translateX})` }}
					>
						<TooltipRows
							title={`${hoveredDay.date.format("DD/MM/YYYY")}${hoveredDay.future ? " · previsto" : ""}`}
							rows={[
								{ label: "Entradas", value: formatToMoney(hoveredDay.inflow), color: FINANCE_COLORS.inflow },
								{ label: "Saídas", value: formatToMoney(hoveredDay.outflow), color: FINANCE_COLORS.outflow },
								{ label: "Saldo do dia", value: formatToMoney(hoveredDay.inflow - hoveredDay.outflow) },
							]}
						/>
					</div>
				) : null}
			</div>
			<div className="relative ml-14 h-4">
				{ticks.map((day) => {
					const index = days.indexOf(day);
					return (
						<span
							key={day.date.format("YYYY-MM-DD")}
							className="text-muted-foreground absolute -translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums"
							style={{ left: `${((index + 0.5) / count) * 100}%` }}
						>
							{day.date.format("DD/MM")}
						</span>
					);
				})}
			</div>
		</div>
	);
}

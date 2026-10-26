"use client";

import { useState } from "react";
import type { TGetFinancesDreOutput } from "@/app/api/finances/analytics/dre/route";
import {
	FINANCE_COLORS,
	formatMonthKey,
	formatPercent,
	getColumnTooltipPosition,
	TooltipRows,
} from "@/app/dashboard/finance/_components/finance-chart-kit";
import { MetricLabel } from "@/app/dashboard/inventory/reports/_components/report-section";
import { niceDomain } from "@/lib/charts/geometry";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type TSerie = TGetFinancesDreOutput["data"]["serie"];

const GROSS_COLOR = FINANCE_COLORS.subtotal;
const OPERATING_COLOR = FINANCE_COLORS.accent;

/** Caminho de uma série com lacunas: meses sem receita (margem nula) interrompem a linha. */
function buildGappedPath(values: (number | null)[], x: (index: number) => number, y: (value: number) => number) {
	let path = "";
	let drawing = false;
	values.forEach((value, index) => {
		if (value === null) {
			drawing = false;
			return;
		}
		path += `${drawing ? "L" : "M"}${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
		drawing = true;
	});
	return path.trim();
}

function lastPoint(values: (number | null)[]) {
	for (let index = values.length - 1; index >= 0; index--) {
		const value = values[index];
		if (value !== null && value !== undefined) return { index, value };
	}
	return null;
}

/** Margem bruta e operacional mês a mês sobre as barras de receita bruta (12 meses). */
export function DreMarginsChart({ serie }: { serie: TSerie }) {
	const [hovered, setHovered] = useState<number | null>(null);
	const count = serie.length;
	const gross = serie.map((month) => month.margemBruta);
	const operating = serie.map((month) => month.margemLiquida);
	const margins = [...gross, ...operating].filter((value): value is number => value !== null);
	const domain = niceDomain(Math.min(0, ...margins), Math.max(15, ...margins), 4, { includeZero: true });
	const span = domain.max - domain.min || 1;
	const y = (value: number) => 100 - ((value - domain.min) / span) * 100;
	const x = (index: number) => ((index + 0.5) / count) * 100;
	const maxRevenue = Math.max(...serie.map((month) => month.receita), 0) * 1.1 || 1;

	const revenue12 = serie.reduce((total, month) => total + month.receita, 0);
	const gross12 = serie.reduce((total, month) => total + month.lucroBruto, 0);
	const operating12 = serie.reduce((total, month) => total + month.resultado, 0);
	const best = serie.reduce<TSerie[number] | null>(
		(acc, month) => (month.margemLiquida !== null && (acc === null || (acc.margemLiquida ?? -Infinity) < month.margemLiquida) ? month : acc),
		null,
	);
	const stats = [
		{ label: "RECEITA 12M", value: formatToMoney(revenue12) },
		{ label: "MARGEM BRUTA 12M", value: revenue12 > 0 ? formatPercent((gross12 / revenue12) * 100) : "—" },
		{ label: "MARGEM OPERACIONAL 12M", value: revenue12 > 0 ? formatPercent((operating12 / revenue12) * 100) : "—" },
		{ label: "MELHOR MÊS", value: best && best.margemLiquida !== null ? `${formatMonthKey(best.mes)} · ${formatPercent(best.margemLiquida)}` : "—" },
	];

	const endDots = [
		{ point: lastPoint(gross), color: GROSS_COLOR },
		{ point: lastPoint(operating), color: OPERATING_COLOR },
	];
	const hoveredMonth = hovered !== null ? serie[hovered] : null;
	const tooltip = hovered !== null ? getColumnTooltipPosition(hovered, count) : null;

	return (
		<>
			<div className="relative mx-9 mt-2 h-60" onMouseLeave={() => setHovered(null)}>
				{domain.ticks.map((tick) => (
					<div key={tick} className="border-border pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: `${y(tick)}%` }}>
						<span className="text-muted-foreground absolute right-full top-[-7px] mr-2 text-[11px] tabular-nums">{tick}%</span>
					</div>
				))}
				{serie.map((month, index) => (
					<div
						key={month.mes}
						className={cn("absolute bottom-0 rounded-t", hovered === index ? "bg-border" : "bg-muted")}
						style={{ left: `${((index + 0.2) / count) * 100}%`, width: `${(0.6 / count) * 100}%`, height: `${(month.receita / maxRevenue) * 100}%` }}
					/>
				))}
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
					{[
						{ values: gross, color: GROSS_COLOR },
						{ values: operating, color: OPERATING_COLOR },
					].map((series) => (
						<path
							key={series.color}
							d={buildGappedPath(series.values, x, y)}
							fill="none"
							stroke={series.color}
							strokeWidth={2.5}
							vectorEffect="non-scaling-stroke"
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					))}
				</svg>
				{endDots.map(({ point, color }) =>
					point ? (
						<div
							key={color}
							className="absolute size-2 rounded-full shadow-[0_0_0_2px_var(--color-card)]"
							style={{ left: `${x(point.index)}%`, top: `${y(point.value)}%`, margin: "-4px 0 0 -4px", background: color }}
						>
							<span className="absolute left-3 top-[-5px] whitespace-nowrap text-[11px] font-bold" style={{ color }}>
								{formatPercent(point.value)}
							</span>
						</div>
					) : null,
				)}
				{serie.map((month, index) => (
					<div
						key={month.mes}
						className="absolute inset-y-0"
						style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%` }}
						onMouseEnter={() => setHovered(index)}
					/>
				))}
				{hoveredMonth && tooltip ? (
					<div
						className="bg-popover text-popover-foreground border-border pointer-events-none absolute top-1 z-[3] flex min-w-[190px] flex-col gap-1.5 rounded-[10px] border px-2.5 py-2 shadow-[0_12px_24px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)]"
						style={{ left: `${tooltip.left}%`, transform: `translateX(${tooltip.translateX})` }}
					>
						<TooltipRows
							title={formatMonthKey(hoveredMonth.mes)}
							rows={[
								{ label: "Receita", value: formatToMoney(hoveredMonth.receita), color: "var(--color-border)" },
								{ label: "Margem bruta", value: hoveredMonth.margemBruta === null ? "—" : formatPercent(hoveredMonth.margemBruta), color: GROSS_COLOR },
								{
									label: "Margem operacional",
									value: hoveredMonth.margemLiquida === null ? "—" : formatPercent(hoveredMonth.margemLiquida),
									color: OPERATING_COLOR,
								},
							]}
						/>
					</div>
				) : null}
			</div>
			<div className="relative mx-9 h-4">
				{serie.map((month, index) => (
					<span key={month.mes} className="text-muted-foreground absolute -translate-x-1/2 text-[11px]" style={{ left: `${x(index)}%` }}>
						{formatMonthKey(month.mes).split("/")[0]}
					</span>
				))}
			</div>
			<div className="border-border grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3 border-t pt-3.5">
				{stats.map((stat) => (
					<div key={stat.label} className="flex flex-col gap-1">
						<MetricLabel>{stat.label}</MetricLabel>
						<span className="text-[15px] font-bold tabular-nums">{stat.value}</span>
					</div>
				))}
			</div>
		</>
	);
}

export function DreMarginsLegend() {
	return (
		<div className="text-muted-foreground flex items-center gap-3.5 text-xs">
			<span className="flex items-center gap-1.5">
				<span className="h-[3px] w-3 rounded-sm" style={{ background: GROSS_COLOR }} />
				Bruta
			</span>
			<span className="flex items-center gap-1.5">
				<span className="h-[3px] w-3 rounded-sm" style={{ background: OPERATING_COLOR }} />
				Operacional
			</span>
		</div>
	);
}

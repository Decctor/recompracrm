"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingUp } from "lucide-react";
import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import { formatToMoney } from "@/lib/formatting";
import { useFinancialAccountGraph } from "@/lib/queries/finances";
import { cn } from "@/lib/utils";

type AccountCardGraphType = "entries-and-exits" | "entries" | "exits" | "consolidated";

const GRAPH_TYPE_OPTIONS: { value: AccountCardGraphType; icon: ReactNode; label: string }[] = [
	{ value: "entries-and-exits", icon: <ArrowUpDown className="h-3 w-3" />, label: "Entradas e Saídas" },
	{ value: "entries", icon: <ArrowUp className="h-3 w-3" />, label: "Entradas" },
	{ value: "exits", icon: <ArrowDown className="h-3 w-3" />, label: "Saídas" },
	{ value: "consolidated", icon: <TrendingUp className="h-3 w-3" />, label: "Resultado líquido" },
];

const GRAPH_TYPE_LABELS: Record<AccountCardGraphType, string> = {
	"entries-and-exits": "Entradas vs Saídas",
	entries: "Entradas",
	exits: "Saídas",
	consolidated: "Resultado líquido",
};

const SERIES_COLORS = { entries: "#16a34a", exits: "#dc2626", net: "#6366f1" } as const;
const SERIES_LABELS = { entries: "Entradas", exits: "Saídas", net: "Resultado líquido" } as const;
type TSeriesKey = keyof typeof SERIES_COLORS;

/** Curva suave: bezier com os controles no ponto médio horizontal entre dois pontos. */
function smoothPath(points: [number, number][]) {
	return points
		.map(([x, y], index) => {
			const previous = points[index - 1];
			if (!previous) return `M${x.toFixed(2)} ${y.toFixed(2)}`;
			const mx = ((previous[0] + x) / 2).toFixed(2);
			return `C${mx} ${previous[1].toFixed(2)} ${mx} ${y.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
		})
		.join(" ");
}

type AccountCardChartProps = {
	accountId: string;
	accountType: TGetFinancialAccountsOutputDefault["accounts"][number]["tipo"];
	startDate: Date | null;
	endDate: Date | null;
};
export function AccountCardChart({ accountId, accountType, startDate, endDate }: AccountCardChartProps) {
	const [graphType, setGraphType] = useState<AccountCardGraphType>("entries-and-exits");
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const { data, isLoading } = useFinancialAccountGraph({ contaFinanceiraId: accountId, startDate, endDate });

	const points = useMemo(
		() => data?.map((d) => ({ ...d, net: accountType === "CARTAO_CREDITO" ? d.exits - d.entries : d.entries - d.exits })) ?? [],
		[accountType, data],
	);

	const visibleSeries: TSeriesKey[] =
		graphType === "entries-and-exits" ? ["entries", "exits"] : graphType === "entries" ? ["entries"] : graphType === "exits" ? ["exits"] : ["net"];
	const primarySeries = visibleSeries[0] ?? "entries";

	// Total da série visível no cabeçalho: líquido nas visões de saldo, soma simples nas demais.
	const sumOf = (key: TSeriesKey) => points.reduce((total, point) => total + point[key], 0);
	const isNetView = graphType === "entries-and-exits" || graphType === "consolidated";
	const headerTotal = graphType === "entries-and-exits" ? sumOf("entries") - sumOf("exits") : sumOf(primarySeries);
	const headerTotalLabel = isNetView
		? `${headerTotal >= 0 ? "+" : "−"}${formatToMoney(Math.abs(headerTotal))}${graphType === "entries-and-exits" ? " líquido" : ""}`
		: formatToMoney(Math.abs(headerTotal));
	const headerTotalColor = isNetView ? (headerTotal >= 0 ? "#15803d" : "#b91c1c") : SERIES_COLORS[primarySeries];

	const header = (
		<div className="mb-1 flex items-center justify-between gap-2 px-0.5">
			<div className="flex min-w-0 items-baseline gap-2">
				<span className="text-muted-foreground whitespace-nowrap text-[0.55rem] font-semibold uppercase tracking-[0.05em]">
					{GRAPH_TYPE_LABELS[graphType]}
				</span>
				{!isLoading && points.length > 0 ? (
					<span className="whitespace-nowrap text-[11px] font-bold tabular-nums" style={{ color: headerTotalColor }}>
						{headerTotalLabel}
					</span>
				) : null}
			</div>
			<div className="flex items-center gap-0.5">
				{GRAPH_TYPE_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type="button"
						title={opt.label}
						aria-label={opt.label}
						aria-pressed={graphType === opt.value}
						onClick={() => setGraphType(opt.value)}
						className={cn(
							"flex h-5 w-5 items-center justify-center rounded-md transition-colors",
							graphType === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{opt.icon}
					</button>
				))}
			</div>
		</div>
	);

	if (isLoading) {
		return (
			<div className="flex w-full flex-1 flex-col">
				{header}
				<div className="flex flex-1 items-center justify-center">
					<span className="text-muted-foreground animate-pulse text-[0.6rem]">Carregando...</span>
				</div>
			</div>
		);
	}

	const hasAnyData = points.some((d) => d.entries > 0 || d.exits > 0);
	if (!hasAnyData) {
		return (
			<div className="flex w-full flex-1 flex-col">
				{header}
				<div className="flex flex-1 items-center justify-center">
					<span className="text-muted-foreground text-[0.6rem]">Sem movimentações no período</span>
				</div>
			</div>
		);
	}

	const count = points.length;
	const values = visibleSeries.flatMap((key) => points.map((point) => point[key]));
	const lo = graphType === "consolidated" ? Math.min(0, ...values) : 0;
	const hi = Math.max(0, ...values);
	const span = (hi - lo) * 1.08 || 1;
	const y = (value: number) => 4 + (1 - (value - lo) / span) * 96;
	const x = (index: number) => (count > 1 ? (index / (count - 1)) * 100 : 50);
	const zero = y(0);
	const paths = visibleSeries.map((key) => {
		const line = smoothPath(points.map((point, index) => [x(index), y(point[key])]));
		return { key, line, area: `${line} L${x(count - 1).toFixed(2)} ${zero.toFixed(2)} L${x(0).toFixed(2)} ${zero.toFixed(2)} Z` };
	});

	const last = count - 1;
	const tickIndexes = [...new Set([0, Math.round(last / 4), Math.round(last / 2), Math.round((last * 3) / 4), last])];
	const hovered = hoverIndex != null ? points[hoverIndex] : undefined;
	const slotWidth = count > 1 ? 100 / (count - 1) : 100;

	return (
		<div className="flex w-full flex-1 flex-col">
			{header}
			<div className="relative h-[88px]" onMouseLeave={() => setHoverIndex(null)}>
				{[25, 50, 75].map((top) => (
					<div key={top} className="border-border/60 pointer-events-none absolute inset-x-0 border-t" style={{ top: `${top}%` }} />
				))}
				{graphType === "consolidated" && lo < 0 ? (
					<div className="border-muted-foreground pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: `${zero}%` }} />
				) : null}
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
					<defs>
						{paths.map(({ key }) => (
							<linearGradient key={key} id={`grad-${key}-${accountId}`} x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor={SERIES_COLORS[key]} stopOpacity={0.35} />
								<stop offset="95%" stopColor={SERIES_COLORS[key]} stopOpacity={0} />
							</linearGradient>
						))}
					</defs>
					{paths.map(({ key, line, area }) => (
						<g key={key}>
							<path d={area} fill={`url(#grad-${key}-${accountId})`} stroke="none" />
							<path d={line} fill="none" stroke={SERIES_COLORS[key]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
						</g>
					))}
				</svg>
				{hovered && hoverIndex != null ? (
					<>
						<div
							className="border-muted-foreground/50 pointer-events-none absolute inset-y-0 border-l border-dashed"
							style={{ left: `${x(hoverIndex)}%` }}
						/>
						{visibleSeries.map((key) => (
							<div
								key={key}
								className="pointer-events-none absolute size-1.5 rounded-full"
								style={{ left: `${x(hoverIndex)}%`, top: `${y(hovered[key])}%`, margin: "-3px 0 0 -3px", background: SERIES_COLORS[key] }}
							/>
						))}
						<div
							className="bg-popover text-popover-foreground border-border pointer-events-none absolute -top-1 z-10 mx-2 flex min-w-[150px] flex-col gap-1 rounded-lg border px-2 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
							style={{ left: `${x(hoverIndex)}%`, transform: `translateX(${hoverIndex > last * 0.62 ? "calc(-100% - 16px)" : "0%"})` }}
						>
							<span className="text-[11px] font-bold">{hovered.label}</span>
							{visibleSeries.map((key) => (
								<div key={key} className="flex items-center gap-1.5 text-[11px]">
									<span className="size-2 rounded-[2px]" style={{ background: SERIES_COLORS[key] }} />
									<span className="text-muted-foreground flex-1">{SERIES_LABELS[key]}</span>
									<span className="font-semibold tabular-nums">{formatToMoney(hovered[key])}</span>
								</div>
							))}
						</div>
					</>
				) : null}
				{points.map((point, index) => (
					<div
						key={point.label}
						className="absolute inset-y-0"
						style={{ left: `${count > 1 ? x(index) - slotWidth / 2 : 0}%`, width: `${slotWidth}%` }}
						onMouseEnter={() => setHoverIndex(index)}
					/>
				))}
			</div>
			<div className="relative mt-1 h-3.5">
				{tickIndexes.map((index, position) => (
					<span
						key={index}
						className="text-muted-foreground absolute whitespace-nowrap text-[8px]"
						style={{ left: `${x(index)}%`, transform: `translateX(${position === 0 ? "0%" : position === tickIndexes.length - 1 ? "-100%" : "-50%"})` }}
					>
						{points[index]?.label}
					</span>
				))}
			</div>
		</div>
	);
}

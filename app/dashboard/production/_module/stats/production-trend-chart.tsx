"use client";

import type { TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import type { TStatsPeriod } from "@/lib/campaigns/stats-period";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { BadgeDollarSign, Factory, Scale } from "lucide-react";
import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { MetricToggle, type TMetricToggleOption } from "./metric-toggle";
import { formatUnitLabel, formatUnitQuantity, getBucketOffset, getElapsedBucketCount } from "./stats-format";

type TSeries = TGetProductionStatsOutput["data"]["series"];
type TTrendMetric = "valor" | "volume" | "producoes";

const TREND_METRICS: TMetricToggleOption<TTrendMetric>[] = [
	{ value: "valor", label: "Valor", icon: BadgeDollarSign },
	{ value: "volume", label: "Volume", icon: Scale },
	{ value: "producoes", label: "Produções", icon: Factory },
];

// Mesmas cores do gráfico de campanhas: âmbar para o período, cinza tracejado para a comparação.
const CURRENT_COLOR = "#E0A100";
const COMPARISON_COLOR = "#9CA3AF";

function formatCompactMoney(value: number) {
	if (Math.abs(value) >= 1000) return `R$ ${formatDecimalPlaces(value / 1000, 1, 1)} mil`;
	return formatToMoney(value);
}

type ProductionTrendChartProps = {
	series: TSeries;
	period: TStatsPeriod;
	comparingPeriod: TStatsPeriod;
	currentLabel: string;
	comparingLabel: string;
	/** Unidade principal do período: o volume da série só conta produções nela. */
	mainUnit: string | null;
};

/**
 * Série do período contra a do período de comparação (tracejada). A linha do período para no
 * intervalo de hoje — o resto do mês ainda não aconteceu, e um zero ali seria uma afirmação falsa.
 */
export function ProductionTrendChart({ series, period, comparingPeriod, currentLabel, comparingLabel, mainUnit }: ProductionTrendChartProps) {
	const gradientId = `production-trend-${useId().replace(/:/g, "")}`;
	const [metric, setMetric] = useState<TTrendMetric>("valor");

	const total = series.points.length;
	const elapsed = getElapsedBucketCount(period, series.granularity, total);
	// A comparação pode ter menos intervalos (outubro tem 31 dias, setembro 30): a API zera as sobras.
	const comparisonTotal = Math.min(total, getBucketOffset(comparingPeriod.startDate, comparingPeriod.endDate, series.granularity) + 1);
	const data = series.points.map((point, index) => ({
		label: point.label,
		value: index < elapsed ? point.current[metric] : null,
		comparisonValue: index < comparisonTotal ? point.comparison[metric] : null,
	}));

	const formatValue = (value: number) => {
		if (metric === "valor") return formatToMoney(value);
		if (metric === "volume") return mainUnit ? formatUnitQuantity(value, mainUnit) : formatDecimalPlaces(value);
		return formatDecimalPlaces(value, 0, 0);
	};
	const formatTick = (value: number) => {
		if (metric === "valor") return formatCompactMoney(value);
		if (metric === "volume") return mainUnit ? `${formatDecimalPlaces(value, 0, 0)} ${formatUnitLabel(mainUnit)}` : formatDecimalPlaces(value, 0, 0);
		return formatDecimalPlaces(value, 0, 0);
	};
	const metricLabel = TREND_METRICS.find((item) => item.value === metric)?.label ?? "";
	const chartConfig = {
		value: { label: currentLabel, color: CURRENT_COLOR },
		comparisonValue: { label: comparingLabel, color: COMPARISON_COLOR },
	} satisfies ChartConfig;

	return (
		<div className="flex h-full min-w-0 flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-4 text-[0.7rem] font-medium text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="h-0.5 w-4 rounded-full bg-[#E0A100]" />
						{currentLabel}
					</span>
					<span className="flex items-center gap-1.5">
						<span className="w-4 border-t-2 border-dashed border-[#9CA3AF]" />
						{comparingLabel}
					</span>
				</div>
				<MetricToggle options={TREND_METRICS} value={metric} onChange={setMetric} ariaLabel="Métrica do gráfico" />
			</div>
			<div className="h-[220px] w-full min-w-0 lg:h-auto lg:min-h-[220px] lg:flex-1">
				<ChartContainer className="aspect-auto h-full min-h-0 w-full min-w-0" config={chartConfig}>
					<AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor={CURRENT_COLOR} stopOpacity={0.35} />
								<stop offset="95%" stopColor={CURRENT_COLOR} stopOpacity={0.02} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tick={{ fontSize: 10 }} />
						<YAxis
							width={metric === "valor" ? 64 : 44}
							tickLine={false}
							axisLine={false}
							allowDecimals={metric !== "producoes"}
							tick={{ fontSize: 10 }}
							tickFormatter={formatTick}
						/>
						<ChartTooltip
							cursor={false}
							content={({ active, payload }) => {
								if (!active || !payload?.length) return null;
								const point = payload[0].payload as (typeof data)[number];
								return (
									<div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-xs shadow-lg">
										<div className="flex flex-col gap-0.5">
											<span className="font-semibold">{point.label}</span>
											<span className="flex items-center gap-1.5">
												<span className="size-2 rounded-full bg-[#E0A100]" />
												{metricLabel}: <strong className="tabular-nums">{point.value == null ? "—" : formatValue(point.value)}</strong>
											</span>
										</div>
										{point.comparisonValue != null ? (
											<div className="flex flex-col gap-0.5 text-muted-foreground">
												<span className="font-semibold">{comparingLabel}</span>
												<span className="flex items-center gap-1.5">
													<span className="size-2 rounded-full bg-[#9CA3AF]" />
													{metricLabel}: <strong className="tabular-nums">{formatValue(point.comparisonValue)}</strong>
												</span>
											</div>
										) : null}
									</div>
								);
							}}
						/>
						<Line
							dataKey="comparisonValue"
							type="monotone"
							stroke={COMPARISON_COLOR}
							strokeWidth={1.5}
							strokeDasharray="4 4"
							dot={false}
							isAnimationActive={false}
						/>
						<Area dataKey="value" type="monotone" fill={`url(#${gradientId})`} stroke={CURRENT_COLOR} strokeWidth={2} />
					</AreaChart>
				</ChartContainer>
			</div>
		</div>
	);
}

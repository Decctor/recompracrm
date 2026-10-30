"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatAdsCompact, formatShortDate } from "@/lib/paid-media/format";
import { formatDateAsLocale } from "@/lib/formatting";
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

export type TComparisonSeriesPoint = { date: string; value: number };

type TChartPoint = {
	day: number;
	current: number | null;
	previous: number | null;
	currentDate: string | null;
	previousDate: string | null;
};

/**
 * Período e comparação sobrepostos pela posição do dia (1º com 1º), e não pela data: é a única forma
 * de pôr setembro e outubro no mesmo eixo. O tooltip devolve as datas reais de cada lado. Mesmo
 * desenho do gráfico comparativo de Resultados de vendas, com o acumulado de quebra.
 */
function buildPoints(current: TComparisonSeriesPoint[], previous: TComparisonSeriesPoint[], cumulative: boolean): TChartPoint[] {
	const length = Math.max(current.length, previous.length);
	let currentTotal = 0;
	let previousTotal = 0;
	const points: TChartPoint[] = [];
	for (let index = 0; index < length; index++) {
		const a = current[index];
		const b = previous[index];
		if (a) currentTotal += a.value;
		if (b) previousTotal += b.value;
		points.push({
			day: index + 1,
			current: a ? (cumulative ? currentTotal : a.value) : null,
			previous: b ? (cumulative ? previousTotal : b.value) : null,
			currentDate: a?.date ?? null,
			previousDate: b?.date ?? null,
		});
	}
	return points;
}

type ComparisonChartProps = {
	current: TComparisonSeriesPoint[];
	previous: TComparisonSeriesPoint[] | null;
	cumulative?: boolean;
	formatValue: (value: number) => string;
	height?: number;
};

export function ComparisonChart({ current, previous, cumulative = false, formatValue, height = 280 }: ComparisonChartProps) {
	const gradientId = useId().replace(/:/g, "");
	const { getChartColors } = useOrgColors();
	const colors = getChartColors();
	const points = useMemo(() => buildPoints(current, previous ?? [], cumulative), [current, previous, cumulative]);
	const config = {
		current: { label: "Período", color: colors.current },
		previous: { label: "Comparação", color: colors.previous },
	} satisfies ChartConfig;

	return (
		<ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
			<AreaChart accessibilityLayer data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
				<defs>
					<linearGradient id={`${gradientId}-current`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor={config.current.color} stopOpacity={0.5} />
						<stop offset="95%" stopColor={config.current.color} stopOpacity={0.04} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="day"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
					tickFormatter={(day) => {
						// O valor do tick é o dia (1, 2, …); o índice do tick não é o do ponto, porque o eixo pula rótulos.
						const date = points[Number(day) - 1]?.currentDate;
						return date ? formatShortDate(date) : `Dia ${day}`;
					}}
				/>
				<YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(value) => formatAdsCompact(Number(value))} />
				<ChartTooltip cursor={false} content={<ComparisonTooltip formatValue={formatValue} colors={colors} />} />
				{previous ? (
					<Area
						dataKey="previous"
						type="monotone"
						fill="transparent"
						stroke={config.previous.color}
						strokeDasharray="4 3"
						strokeWidth={1.5}
						connectNulls={false}
						isAnimationActive={false}
					/>
				) : null}
				<Area dataKey="current" type="monotone" fill={`url(#${gradientId}-current)`} stroke={config.current.color} strokeWidth={2} connectNulls={false} />
			</AreaChart>
		</ChartContainer>
	);
}

type ComparisonTooltipProps = {
	active?: boolean;
	payload?: Array<{ payload: TChartPoint }>;
	formatValue: (value: number) => string;
	colors: { current: string; previous: string };
};

function ComparisonTooltip({ active, payload, formatValue, colors }: ComparisonTooltipProps) {
	if (!active || !payload || payload.length === 0) return null;
	const point = payload[0].payload;
	return (
		<div className="text-numeric flex flex-col gap-2 rounded-lg border border-border bg-background p-3 shadow-lg">
			<p className="text-label">Dia {point.day}</p>
			<TooltipRow color={colors.current} date={point.currentDate} value={point.current} formatValue={formatValue} />
			{point.previousDate ? (
				<TooltipRow color={colors.previous} date={point.previousDate} value={point.previous} formatValue={formatValue} muted />
			) : null}
		</div>
	);
}

function TooltipRow({
	color,
	date,
	value,
	formatValue,
	muted,
}: {
	color: string;
	date: string | null;
	value: number | null;
	formatValue: (value: number) => string;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="inline-flex items-center gap-1.5">
				<span className="size-2 rounded-full" style={{ backgroundColor: color }} />
				<span className="text-xs text-muted-foreground">{date ? formatDateAsLocale(`${date}T12:00:00`) : "—"}</span>
			</span>
			<span className={muted ? "text-xs font-semibold text-muted-foreground" : "text-xs font-bold text-foreground"}>
				{value === null ? "—" : formatValue(value)}
			</span>
		</div>
	);
}

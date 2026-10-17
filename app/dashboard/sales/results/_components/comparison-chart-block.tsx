"use client";

import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Ranking } from "@/components/ui/ranking";
import { Section } from "@/components/ui/section";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import type { TSalesComparisonStats } from "@/lib/sales/comparison-stats";
import { BadgeDollarSign, ChartSpline, CirclePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type ComparisonChartBlockProps = {
	data: TSalesComparisonStats;
};

type TMetric = "total" | "qtde";

type TChartPoint = {
	dia: number;
	base: number | null;
	comparacao: number | null;
	baseData: string | null;
	comparacaoData: string | null;
};

/**
 * Os dois períodos sobrepostos pela posição do dia (1º dia com 1º dia), e não pela data: é a única
 * forma de pôr setembro e outubro no mesmo eixo. O tooltip devolve as datas reais de cada lado.
 */
export function ComparisonChartBlock({ data }: ComparisonChartBlockProps) {
	const [metric, setMetric] = useState<TMetric>("total");
	const { getChartColors } = useOrgColors();
	const chartColors = getChartColors();

	const chartData = useMemo<TChartPoint[]>(
		() =>
			data.serie.map((point) => ({
				dia: point.dia,
				base: point.base ? point.base[metric] : null,
				comparacao: point.comparacao ? point.comparacao[metric] : null,
				baseData: point.base?.data ?? null,
				comparacaoData: point.comparacao?.data ?? null,
			})),
		[data.serie, metric],
	);

	const chartConfig = {
		base: { label: "Período", color: chartColors.current },
		comparacao: { label: "Comparação", color: chartColors.previous },
	} satisfies ChartConfig;

	const formatValue = metric === "total" ? (n: number) => formatToMoney(n) : (n: number) => formatDecimalPlaces(n, 0, 0);

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ChartSpline />
				</Section.Icon>
				<Section.Title>Evolução diária</Section.Title>
				<Section.Actions>
					<Ranking.Provider>
						<Ranking.SortButton active={metric === "total"} tooltip="Valor vendido" onClick={() => setMetric("total")}>
							<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
						</Ranking.SortButton>
						<Ranking.SortButton active={metric === "qtde"} tooltip="Quantidade de vendas" onClick={() => setMetric("qtde")}>
							<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
						</Ranking.SortButton>
					</Ranking.Provider>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full lg:h-[320px]">
					<AreaChart accessibilityLayer data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="fillComparisonBase" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor={chartConfig.base.color} stopOpacity={0.6} />
								<stop offset="95%" stopColor={chartConfig.base.color} stopOpacity={0.05} />
							</linearGradient>
							<linearGradient id="fillComparisonReference" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor={chartConfig.comparacao.color} stopOpacity={0.35} />
								<stop offset="95%" stopColor={chartConfig.comparacao.color} stopOpacity={0.03} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => `Dia ${value}`} minTickGap={24} />
						<YAxis tickLine={false} axisLine={false} width={metric === "total" ? 72 : 36} tickFormatter={(value) => formatValue(Number(value))} />
						<ChartTooltip cursor={false} content={<ComparisonTooltip formatValue={formatValue} colors={chartColors} />} />
						<Area
							dataKey="comparacao"
							type="monotone"
							fill="url(#fillComparisonReference)"
							stroke={chartConfig.comparacao.color}
							strokeDasharray="4 3"
							strokeWidth={1.5}
							connectNulls={false}
						/>
						<Area dataKey="base" type="monotone" fill="url(#fillComparisonBase)" stroke={chartConfig.base.color} strokeWidth={2} connectNulls={false} />
					</AreaChart>
				</ChartContainer>
			</Section.Body>
		</Section.Root>
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
		<div className="bg-background border-border flex flex-col gap-2 rounded-lg border p-3 shadow-lg">
			<p className="text-xs font-bold uppercase tracking-tight">Dia {point.dia}</p>
			<TooltipRow color={colors.current} date={point.baseData} value={point.base} formatValue={formatValue} />
			<TooltipRow color={colors.previous} date={point.comparacaoData} value={point.comparacao} formatValue={formatValue} muted />
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
				<span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
				<span className="text-muted-foreground text-xs">{date ? formatDateAsLocale(date) : "—"}</span>
			</span>
			<span className={muted ? "text-muted-foreground text-xs font-semibold tabular-nums" : "text-foreground text-xs font-bold tabular-nums"}>
				{value === null ? "—" : formatValue(value)}
			</span>
		</div>
	);
}

"use client";

import type { TGetCampaignGraphInput } from "@/app/api/campaigns/stats/graph/route";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignGraph } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, MessageCircle, MousePointerClick } from "lucide-react";
import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

type TGraphType = TGetCampaignGraphInput["graphType"];

const GRAPH_TYPES: { value: TGraphType; label: string; icon: typeof MessageCircle }[] = [
	{ value: "interactions", label: "Interações", icon: MessageCircle },
	{ value: "conversions", label: "Conversões", icon: MousePointerClick },
	{ value: "revenue", label: "Receita", icon: BadgeDollarSign },
];

const CURRENT_COLOR = "#E0A100";
const COMPARISON_COLOR = "#9CA3AF";

function formatCompactMoney(value: number) {
	if (Math.abs(value) >= 1000) return `R$ ${formatDecimalPlaces(value / 1000)} mil`;
	return formatToMoney(value);
}

type CampaignsTrendChartProps = {
	startDate: Date | null;
	endDate: Date | null;
	comparingStartDate: Date | null;
	comparingEndDate: Date | null;
	currentLabel: string;
	comparingLabel: string;
	campaignId?: string;
	defaultGraphType?: TGraphType;
};

/**
 * Série do período contra a do período de comparação (tracejada), na métrica escolhida. Sem cartão
 * próprio: vive dentro do bloco de resultado.
 */
export function CampaignsTrendChart({
	startDate,
	endDate,
	comparingStartDate,
	comparingEndDate,
	currentLabel,
	comparingLabel,
	campaignId,
	defaultGraphType = "revenue",
}: CampaignsTrendChartProps) {
	const gradientId = useId().replace(/:/g, "");
	const [graphType, setGraphType] = useState<TGraphType>(defaultGraphType);
	const { data: graphData, isLoading } = useCampaignGraph({
		graphType,
		startDate: startDate ?? undefined,
		endDate: endDate ?? undefined,
		comparingStartDate: comparingStartDate ?? undefined,
		comparingEndDate: comparingEndDate ?? undefined,
		campaignId,
	});

	const metricLabel = GRAPH_TYPES.find((type) => type.value === graphType)?.label ?? "";
	const formatValue = (value: number) => (graphType === "revenue" ? formatToMoney(value) : formatDecimalPlaces(value));
	const chartConfig = {
		value: { label: currentLabel, color: CURRENT_COLOR },
		comparisonValue: { label: comparingLabel, color: COMPARISON_COLOR },
	} satisfies ChartConfig;
	const hasComparison = graphData?.some((point) => point.comparisonValue != null) ?? false;

	return (
		<div className="flex h-full min-w-0 flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-4 text-[0.7rem] font-medium text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
						{currentLabel}
					</span>
					{hasComparison ? (
						<span className="flex items-center gap-1.5">
							<span className="w-4 border-t-2 border-dashed" style={{ borderColor: COMPARISON_COLOR }} />
							{comparingLabel}
						</span>
					) : null}
				</div>
				<div className="flex items-center gap-1" role="group" aria-label="Métrica do gráfico">
					{GRAPH_TYPES.map((type) => {
						const Icon = type.icon;
						const active = type.value === graphType;
						return (
							<button
								key={type.value}
								type="button"
								aria-pressed={active}
								onClick={() => setGraphType(type.value)}
								className={cn(
									"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
									active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
								)}
							>
								<Icon className="size-3.5 min-h-3.5 min-w-3.5" />
								{type.label}
							</button>
						);
					})}
				</div>
			</div>
			<div className="h-[220px] w-full min-w-0 lg:h-auto lg:min-h-[220px] lg:flex-1">
				{isLoading ? (
					<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Carregando gráfico...</div>
				) : graphData && graphData.length > 0 ? (
					<ChartContainer className="aspect-auto h-full w-full min-h-0 min-w-0" config={chartConfig}>
						<AreaChart accessibilityLayer data={graphData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
							<defs>
								<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={CURRENT_COLOR} stopOpacity={0.35} />
									<stop offset="95%" stopColor={CURRENT_COLOR} stopOpacity={0.02} />
								</linearGradient>
							</defs>
							<CartesianGrid vertical={false} />
							<XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tick={{ fontSize: 10 }} />
							<YAxis
								width={graphType === "revenue" ? 64 : 36}
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 10 }}
								tickFormatter={(value: number) => (graphType === "revenue" ? formatCompactMoney(value) : formatDecimalPlaces(value))}
							/>
							<ChartTooltip
								cursor={false}
								content={({ active, payload }) => {
									if (!active || !payload?.length) return null;
									const point = payload[0].payload as { label: string; value: number; comparisonLabel?: string; comparisonValue?: number };
									return (
										<div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-xs shadow-lg">
											<div className="flex flex-col gap-0.5">
												<span className="font-semibold">{point.label}</span>
												<span className="flex items-center gap-1.5">
													<span className="size-2 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} />
													{metricLabel}: <strong className="tabular-nums">{formatValue(point.value)}</strong>
												</span>
											</div>
											{point.comparisonValue != null && point.comparisonLabel ? (
												<div className="flex flex-col gap-0.5 text-muted-foreground">
													<span className="font-semibold">{point.comparisonLabel}</span>
													<span className="flex items-center gap-1.5">
														<span className="size-2 rounded-full" style={{ backgroundColor: COMPARISON_COLOR }} />
														{metricLabel}: <strong className="tabular-nums">{formatValue(point.comparisonValue)}</strong>
													</span>
												</div>
											) : null}
										</div>
									);
								}}
							/>
							{hasComparison ? (
								<Line dataKey="comparisonValue" type="monotone" stroke={COMPARISON_COLOR} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
							) : null}
							<Area dataKey="value" type="monotone" fill={`url(#${gradientId})`} stroke={CURRENT_COLOR} strokeWidth={2} />
						</AreaChart>
					</ChartContainer>
				) : (
					<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
						Nenhum dado disponível para o período selecionado.
					</div>
				)}
			</div>
		</div>
	);
}

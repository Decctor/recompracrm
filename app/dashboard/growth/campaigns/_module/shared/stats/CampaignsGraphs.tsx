"use client";
import type { TGetCampaignGraphInput } from "@/app/api/campaigns/stats/graph/route";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignGraph } from "@/lib/queries/campaigns";
import { BadgeDollarSign, MessageCircle, MousePointerClick } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";

type CustomGraphTooltipProps = {
	active?: boolean;
	payload?: Array<{
		payload: { label: string; value: number; comparisonLabel?: string; comparisonValue?: number };
		value: number;
		color?: string;
	}>;
	valueFormatter: (value: number) => string;
	metricLabel: string;
};

function CustomCampaignTooltip({ active, payload, valueFormatter, metricLabel }: CustomGraphTooltipProps) {
	if (!active || !payload || !payload.length) return null;

	const data = payload[0].payload;

	return (
		<div className="bg-background border-border rounded-lg border p-3 shadow-lg">
			<div className="flex flex-col gap-2">
				{/* Main period */}
				<div>
					<p className="text-foreground text-xs font-semibold mb-1">{data.label}</p>
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-[#FFB900]" />
						<span className="text-muted-foreground text-xs">{metricLabel}:</span>
						<span className="text-foreground text-xs font-semibold">{valueFormatter(data.value)}</span>
					</div>
				</div>
				{/* Comparison period (if exists) */}
				{data.comparisonValue !== undefined && data.comparisonLabel && (
					<div>
						<p className="text-muted-foreground text-xs font-semibold mb-1">{data.comparisonLabel}</p>
						<div className="flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-[#24549C]" />
							<span className="text-muted-foreground text-xs">{metricLabel}:</span>
							<span className="text-muted-foreground text-xs font-semibold">{valueFormatter(data.comparisonValue)}</span>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

type CampaignsGraphsProps = {
	startDate: Date | null;
	endDate: Date | null;
	comparingStartDate?: Date | null;
	comparingEndDate?: Date | null;
	campaignId?: string;
};

export default function CampaignsGraphs({ startDate, endDate, comparingStartDate, comparingEndDate, campaignId }: CampaignsGraphsProps) {
	const [graphType, setGraphType] = useState<TGetCampaignGraphInput["graphType"]>("interactions");

	const { data: graphData, isLoading: graphLoading } = useCampaignGraph({
		graphType,
		startDate: startDate ?? undefined,
		endDate: endDate ?? undefined,
		comparingStartDate: comparingStartDate ?? undefined,
		comparingEndDate: comparingEndDate ?? undefined,
		campaignId,
	});

	const chartConfig = {
		value: {
			label: graphType === "interactions" ? "Interações" : graphType === "conversions" ? "Conversões" : "Receita",
			color: "#FFB900",
		},
		comparisonValue: {
			label:
				graphType === "interactions"
					? "Interações (período anterior)"
					: graphType === "conversions"
						? "Conversões (período anterior)"
						: "Receita (período anterior)",
			color: "#24549C",
		},
	} satisfies ChartConfig;

	const metricLabels = {
		interactions: "Interações",
		conversions: "Conversões",
		revenue: "Receita",
	};

	const valueFormatter = (value: number) => {
		if (graphType === "revenue") {
			return formatToMoney(value);
		}
		return formatDecimalPlaces(value);
	};

	return (
		<div className="flex w-full flex-col gap-2 py-2 lg:h-full">
			<div className="bg-card border-border flex w-full flex-col gap-3 overflow-hidden rounded-xl border px-3 py-4 shadow-2xs lg:h-full lg:min-h-0">
				<div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
					<h1 className="text-xs font-medium tracking-tight uppercase">GRÁFICO DE CAMPANHAS</h1>
					<div className="flex items-center gap-2">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "interactions" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("interactions")}
										>
											<MessageCircle className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Interações por Período</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "conversions" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("conversions")}
										>
											<MousePointerClick className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Conversões por Período</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "revenue" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("revenue")}
										>
											<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Receita por Período</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
				<div className="flex w-full min-h-0 min-w-0 flex-1">
					{graphLoading ? (
						<div className="flex h-[240px] w-full items-center justify-center sm:h-[280px] lg:h-full">
							<p className="text-sm text-muted-foreground">Carregando gráfico...</p>
						</div>
					) : graphData && graphData.length > 0 ? (
						<div className="flex h-[240px] w-full min-w-0 items-center justify-center sm:h-[280px] lg:h-full lg:min-h-[280px]">
							<ChartContainer className="aspect-auto h-full w-full min-h-0 min-w-0" config={chartConfig}>
								<AreaChart
									accessibilityLayer
									data={graphData}
									margin={{
										top: 12,
										right: 8,
										left: 0,
										bottom: 0,
									}}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="label"
										tickLine={false}
										tickMargin={8}
										axisLine={false}
										minTickGap={24}
										tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
										tickFormatter={(value) => value.slice(0, 12)}
									/>
									<YAxis
										width={graphType === "revenue" ? 52 : 36}
										tickLine={false}
										axisLine={false}
										tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
										tickFormatter={(value) => (graphType === "revenue" ? formatToMoney(value) : formatDecimalPlaces(value))}
									/>
									<ChartTooltip cursor={false} content={<CustomCampaignTooltip valueFormatter={valueFormatter} metricLabel={metricLabels[graphType]} />} />
									<defs>
										<linearGradient id="fillCampaignValue" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor={chartConfig.value.color} stopOpacity={0.8} />
											<stop offset="95%" stopColor={chartConfig.value.color} stopOpacity={0.1} />
										</linearGradient>
										<linearGradient id="fillCampaignComparisonValue" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor={chartConfig.comparisonValue.color} stopOpacity={0.6} />
											<stop offset="95%" stopColor={chartConfig.comparisonValue.color} stopOpacity={0.1} />
										</linearGradient>
									</defs>
									{/* Comparison area (rendered first = behind) */}
									{graphData?.[0]?.comparisonValue !== undefined && (
										<Area
											dataKey="comparisonValue"
											type="monotone"
											fill="url(#fillCampaignComparisonValue)"
											fillOpacity={0.3}
											stroke={chartConfig.comparisonValue.color}
											strokeWidth={1.5}
											strokeDasharray="4 4"
										/>
									)}
									{/* Main area (rendered second = in front) */}
									<Area dataKey="value" type="monotone" fill="url(#fillCampaignValue)" fillOpacity={0.4} stroke={chartConfig.value.color} strokeWidth={2} />
								</AreaChart>
							</ChartContainer>
						</div>
					) : (
						<div className="flex h-[240px] w-full items-center justify-center sm:h-[280px] lg:h-full">
							<p className="text-sm text-muted-foreground">Nenhum dado disponível para o período selecionado.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

"use client";
import type { TGetCampaignGraphInput } from "@/app/api/campaigns/stats/graph/route";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignGraph } from "@/lib/queries/campaigns";
import { BadgeDollarSign, MessageCircle, MousePointerClick } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip } from "../ui/chart";

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
		<div className="w-full flex flex-col gap-2 py-2 h-full">
			<div className="bg-card border-primary/20 flex w-full h-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
					<h1 className="text-xs font-medium tracking-tight uppercase">GRÁFICO DE CAMPANHAS</h1>
					<div className="flex items-center gap-2">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={graphType === "interactions" ? "default" : "ghost"}
										size="fit"
										className="rounded-lg p-2"
										onClick={() => setGraphType("interactions")}
									>
										<MessageCircle className="h-4 min-h-4 w-4 min-w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Interações por Período</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={graphType === "conversions" ? "default" : "ghost"}
										size="fit"
										className="rounded-lg p-2"
										onClick={() => setGraphType("conversions")}
									>
										<MousePointerClick className="h-4 min-h-4 w-4 min-w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Conversões por Período</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant={graphType === "revenue" ? "default" : "ghost"}
										size="fit"
										className="rounded-lg p-2"
										onClick={() => setGraphType("revenue")}
									>
										<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Receita por Período</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
				<div className="flex w-full flex-1 gap-4 min-h-0">
					{graphLoading ? (
						<div className="flex w-full h-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Carregando gráfico...</p>
						</div>
					) : graphData && graphData.length > 0 ? (
						<div className="flex w-full h-full items-center justify-center min-h-[350px]">
							<ChartContainer className="aspect-auto h-full w-full min-h-[350px]" config={chartConfig}>
								<AreaChart
									accessibilityLayer
									data={graphData}
									margin={{
										top: 15,
										right: 15,
										left: 15,
										bottom: 15,
									}}
								>
									<CartesianGrid vertical={false} />
									<XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(value) => value.slice(0, 12)} />
									<YAxis tickFormatter={(value) => (graphType === "revenue" ? formatToMoney(value) : formatDecimalPlaces(value))} />
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
						<div className="flex w-full h-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Nenhum dado disponível para o período selecionado.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

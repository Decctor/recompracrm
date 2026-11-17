"use client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductsGraph } from "@/lib/queries/products";
import type { TGetProductsGraphInput } from "@/app/api/products/stats/graph/route";
import { BadgeDollarSign, CirclePlus, Package, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type CustomGraphTooltipProps = {
	active?: boolean;
	payload?: Array<{
		payload: { label: string; value: number };
		value: number;
		color?: string;
	}>;
	valueFormatter: (value: number) => string;
	metricLabel: string;
};

function CustomProductsTooltip({ active, payload, valueFormatter, metricLabel }: CustomGraphTooltipProps) {
	if (!active || !payload || !payload.length) return null;

	const data = payload[0].payload;

	return (
		<div className="bg-background border-border rounded-lg border p-3 shadow-lg">
			<p className="text-foreground mb-2 text-xs font-semibold">{data.label}</p>
			<div className="flex items-center gap-2">
				<div className="h-2 w-2 rounded-full" style={{ backgroundColor: payload[0].color }} />
				<span className="text-muted-foreground text-xs">{metricLabel}:</span>
				<span className="text-foreground text-xs font-semibold">{valueFormatter(data.value)}</span>
			</div>
		</div>
	);
}

type ProductsGraphsProps = {
	periodAfter: Date | null;
	periodBefore: Date | null;
	// dadosSensiveis.visualizarCustos: sem ela a série de margem nem é oferecida (a rota a recusa).
	canViewCosts: boolean;
};

export default function ProductsGraphs({ periodAfter, periodBefore, canViewCosts }: ProductsGraphsProps) {
	const [graphType, setGraphType] = useState<TGetProductsGraphInput["graphType"]>("sales-value");

	const { data: graphData, isLoading: graphLoading } = useProductsGraph({
		graphType,
		periodAfter: periodAfter ?? undefined,
		periodBefore: periodBefore ?? undefined,
	});

	const chartConfig = {
		value: {
			label:
				graphType === "sales-value"
					? "Faturamento"
					: graphType === "sales-quantity"
						? "Quantidade Vendida"
						: graphType === "active-products"
							? "Produtos Ativos"
							: "Margem (%)",
			color: "#FFB900",
		},
	} satisfies ChartConfig;

	const metricLabels = {
		"sales-value": "Faturamento",
		"sales-quantity": "Quantidade",
		"active-products": "Produtos Ativos",
		margin: "Margem (%)",
	};

	const valueFormatter = (value: number) => {
		if (graphType === "sales-value") {
			return formatToMoney(value);
		}
		if (graphType === "margin") {
			return `${formatDecimalPlaces(value)}%`;
		}
		return formatDecimalPlaces(value);
	};

	return (
		<div className="flex h-full min-h-0 w-full flex-col py-2">
			<div className="bg-card border-border flex h-full min-h-0 w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
					<h1 className="text-xs font-medium tracking-tight uppercase">GRÁFICO DE PRODUTOS</h1>
					<div className="flex items-center gap-2">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "sales-value" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("sales-value")}
										>
											<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Faturamento Total</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "sales-quantity" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("sales-quantity")}
										>
											<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Quantidade Vendida</p>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant={graphType === "active-products" ? "default" : "ghost"}
											size="fit"
											className="rounded-lg p-2"
											onClick={() => setGraphType("active-products")}
										>
											<Package className="h-4 min-h-4 w-4 min-w-4" />
										</Button>
									}
								/>
								<TooltipContent>
									<p>Produtos Ativos por Período</p>
								</TooltipContent>
							</Tooltip>
							{canViewCosts ? (
								<Tooltip>
									<TooltipTrigger
										render={
											<Button variant={graphType === "margin" ? "default" : "ghost"} size="fit" className="rounded-lg p-2" onClick={() => setGraphType("margin")}>
												<TrendingUp className="h-4 min-h-4 w-4 min-w-4" />
											</Button>
										}
									/>
									<TooltipContent>
										<p>Evolução da Margem</p>
									</TooltipContent>
								</Tooltip>
							) : null}
						</TooltipProvider>
					</div>
				</div>
				<div className="relative flex w-full min-h-0 flex-1 overflow-hidden">
					{graphLoading && !graphData ? (
						<div className="flex h-full w-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Carregando gráfico...</p>
						</div>
					) : graphData && graphData.length > 0 ? (
						<ChartContainer className="aspect-auto h-full w-full min-h-0" config={chartConfig}>
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
								<YAxis tickFormatter={valueFormatter} width={80} />
								<ChartTooltip cursor={false} content={<CustomProductsTooltip valueFormatter={valueFormatter} metricLabel={metricLabels[graphType]} />} />
								<defs>
									<linearGradient id="fillProductsValue" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor={chartConfig.value.color} stopOpacity={0.8} />
										<stop offset="95%" stopColor={chartConfig.value.color} stopOpacity={0.1} />
									</linearGradient>
								</defs>
								<Area dataKey="value" type="monotone" fill="url(#fillProductsValue)" fillOpacity={0.4} stroke={chartConfig.value.color} strokeWidth={2} />
							</AreaChart>
						</ChartContainer>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Nenhum dado disponível para o período selecionado.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

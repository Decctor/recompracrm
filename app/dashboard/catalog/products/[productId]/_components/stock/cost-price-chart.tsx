"use client";

import type { TGetProductPriceCostHistoryOutput } from "@/app/api/products/price-cost-history/route";
import {
	ChartEventMarker,
	ChartFloatingCard,
	ChartGridLines,
	ChartXAxis,
	ChartYAxis,
	EventChip,
	OriginChip,
} from "@/components/Charts/ChartPrimitives";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Skeleton } from "@/components/ui/skeleton";
import { niceDomain, stepPath } from "@/lib/charts/geometry";
import { getErrorMessage } from "@/lib/errors";
import { useProductPriceCostHistory } from "@/lib/queries/product-stock-analytics";
import {
	dayKeyToDate,
	formatCompactMoney,
	formatDate,
	formatDayFull,
	formatFraction,
	formatMoney,
	formatPercentagePoints,
	formatQuantity,
	formatSignedFraction,
} from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, ShoppingCart, Tag } from "lucide-react";
import { useMemo, useState } from "react";

type THistory = TGetProductPriceCostHistoryOutput["data"];

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const CHART_HEIGHT = 200;
const MARGIN_HEIGHT = 56;

export function CostPriceChart({ productId, unit, enabled = true }: { productId: string; unit: string; enabled?: boolean }) {
	const { data, isLoading, error } = useProductPriceCostHistory({ productId, enabled });
	return (
		<div className="bg-card border-border flex flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<BadgeDollarSign className="size-4" />
					<h3 className="text-xs font-medium leading-none tracking-tight">CUSTO, PREÇO E MARGEM</h3>
				</div>
				<span className="text-muted-foreground text-[0.65rem] font-medium">ÚLTIMOS 12 MESES</span>
			</div>
			{isLoading ? <Skeleton className="h-[280px] w-full rounded-xl" /> : null}
			{error ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{data ? <CostPriceContent data={data} unit={unit} /> : null}
		</div>
	);
}

function CostPriceContent({ data, unit }: { data: THistory; unit: string }) {
	const [hovered, setHovered] = useState<string | null>(null);
	const { resumo } = data;

	const chart = useMemo(() => {
		const span = data.fim - data.inicio || 1;
		const xOf = (time: number) => Math.max(0, Math.min(100, ((time - data.inicio) / span) * 100));
		const costChanges: { x: number; value: number }[] = [];
		if (resumo.custoInicio != null) costChanges.push({ x: 0, value: resumo.custoInicio });
		for (const purchase of data.compras) costChanges.push({ x: xOf(purchase.data), value: purchase.custoUnitario });
		const priceChanges = [
			{ x: 0, value: resumo.precoInicio },
			...data.precos.map((change) => ({ x: xOf(dayKeyToDate(change.dia).getTime()), value: change.para })),
		];
		const values = [...costChanges, ...priceChanges].map((point) => point.value).filter((value) => value > 0);
		const domain = niceDomain(Math.min(...values) * 0.85, Math.max(...values) * 1.08, 3);
		const y = (value: number) => 100 - ((value - domain.min) / (domain.max - domain.min || 1)) * 100;
		const valueAt = (changes: { x: number; value: number }[], x: number) => {
			let value = changes[0]?.value ?? 0;
			for (const change of changes) if (change.x <= x) value = change.value;
			return value;
		};
		const costPath = stepPath(costChanges.map((point) => ({ x: point.x, y: y(point.value) })));
		const pricePath = stepPath(priceChanges.map((point) => ({ x: point.x, y: y(point.value) })));

		// Faixa de margem: o preço da esquerda para a direita e o custo de volta.
		const breakpoints = [...new Set([0, ...costChanges.map((point) => point.x), ...priceChanges.map((point) => point.x), 100])].sort((a, b) => a - b);
		const band =
			costChanges.length > 0
				? `${breakpoints.map((x, index) => `${index ? "L" : "M"}${x.toFixed(3)},${y(valueAt(priceChanges, x)).toFixed(3)}`).join(" ")} ${breakpoints
						.slice()
						.reverse()
						.map((x) => `L${x.toFixed(3)},${y(valueAt(costChanges, x)).toFixed(3)}`)
						.join(" ")} Z`
				: "";

		const margins = breakpoints.map((x) => {
			const price = valueAt(priceChanges, x);
			return { x, value: price > 0 && costChanges.length > 0 ? (price - valueAt(costChanges, x)) / price : 0 };
		});
		const marginLow = Math.min(...margins.map((margin) => margin.value));
		const marginHigh = Math.max(...margins.map((margin) => margin.value));
		const marginPad = Math.max(0.01, (marginHigh - marginLow) * 0.25);
		const marginY = (value: number) => 100 - ((value - (marginLow - marginPad)) / (marginHigh - marginLow + marginPad * 2)) * 100;
		const marginPath = stepPath(margins.map((margin) => ({ x: margin.x, y: marginY(margin.value) })));

		const xTicks: { x: number; label: string }[] = [];
		const start = new Date(data.inicio);
		for (let month = 1; month <= 12; month++) {
			const date = new Date(start.getFullYear(), start.getMonth() + month, 1);
			if (date.getTime() <= data.fim) xTicks.push({ x: xOf(date.getTime()), label: MONTHS[date.getMonth()] });
		}

		const markers = [
			...data.compras.map((purchase, index) => ({
				id: `compra-${index}`,
				kind: "COMPRA" as const,
				index,
				x: xOf(purchase.data),
				y: y(purchase.custoUnitario),
			})),
			...data.precos.map((change, index) => ({
				id: `preco-${index}`,
				kind: "PRECO" as const,
				index,
				x: xOf(dayKeyToDate(change.dia).getTime()),
				y: y(change.para),
			})),
		];
		return {
			costPath,
			pricePath,
			band,
			marginPath,
			marginArea: `${marginPath} L100,100 L0,100 Z`,
			markers,
			xTicks,
			valueAt,
			costChanges,
			priceChanges,
			priceLabelY: y(resumo.precoAtual),
			costLabelY: resumo.custoAtual != null ? y(resumo.custoAtual) : null,
			yTicks: domain.ticks.map((value) => ({ y: y(value), label: formatCompactMoney(value) })),
		};
	}, [data, resumo]);

	if (data.compras.length === 0 && resumo.custoInicio == null && resumo.precoAtual <= 0) {
		return <p className="text-muted-foreground py-6 text-center text-xs">Sem compras nem preço de venda para montar o histórico.</p>;
	}

	const activeMarker = chart.markers.find((marker) => marker.id === hovered) ?? null;
	const costDelta = resumo.custoInicio && resumo.custoAtual != null ? (resumo.custoAtual - resumo.custoInicio) / resumo.custoInicio : null;
	const priceDelta = resumo.precoInicio > 0 ? (resumo.precoAtual - resumo.precoInicio) / resumo.precoInicio : null;
	const marginDelta = resumo.margemAtual != null && resumo.margemInicio != null ? resumo.margemAtual - resumo.margemInicio : null;
	const summary = [
		{
			label: "Custo atual",
			value: resumo.custoAtual != null ? formatMoney(resumo.custoAtual) : "—",
			delta: costDelta != null ? `${formatSignedFraction(costDelta)} em 12m` : "",
			valueClass: "text-[#9a691e]",
			deltaClass: costDelta != null && costDelta > 0 ? "text-red-600" : "text-success",
		},
		{
			label: "Preço de venda",
			value: formatMoney(resumo.precoAtual),
			delta: priceDelta != null ? `${formatSignedFraction(priceDelta)} em 12m` : "",
			valueClass: "text-info",
			deltaClass: priceDelta != null && priceDelta < 0 ? "text-red-600" : "text-success",
		},
		{
			label: "Margem atual",
			value: resumo.margemAtual != null ? formatFraction(resumo.margemAtual, 1) : "—",
			delta: marginDelta != null ? formatPercentagePoints(marginDelta) : "",
			valueClass: "text-success-strong",
			deltaClass: marginDelta != null && marginDelta < 0 ? "text-red-600" : "text-success",
		},
		{
			label: "Custo médio ponderado",
			value: resumo.custoMedioPonderado != null ? formatMoney(resumo.custoMedioPonderado) : "—",
			delta: `${resumo.quantidadeCompras} ${resumo.quantidadeCompras === 1 ? "compra" : "compras"}`,
			valueClass: "text-foreground",
			deltaClass: "text-muted-foreground",
		},
	];

	return (
		<div className="flex flex-wrap gap-5">
			<div className="grid min-w-0 flex-[1_1_520px] grid-cols-[52px_minmax(0,1fr)] gap-x-2">
				<ChartYAxis ticks={chart.yTicks} height={CHART_HEIGHT} />
				<div className="relative" style={{ height: CHART_HEIGHT }} onMouseLeave={() => setHovered(null)}>
					<ChartGridLines ticks={chart.yTicks} />
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
						<path d={chart.band} className="fill-info" fillOpacity={0.07} />
						<path d={chart.pricePath} fill="none" className="stroke-info" strokeWidth={2} vectorEffect="non-scaling-stroke" />
						<path d={chart.costPath} fill="none" className="stroke-[#c98a2c]" strokeWidth={2} vectorEffect="non-scaling-stroke" />
					</svg>
					<span className="text-info absolute right-1 -translate-y-[130%] text-[10px] font-bold" style={{ top: `${chart.priceLabelY}%` }}>
						PREÇO
					</span>
					{chart.costLabelY != null ? (
						<>
							<span className="absolute right-1 translate-y-[30%] text-[10px] font-bold text-[#9a691e]" style={{ top: `${chart.costLabelY}%` }}>
								CUSTO
							</span>
							<span
								className="text-primary/60 absolute right-1 -translate-y-1/2 text-[10px] font-bold"
								style={{ top: `${(chart.priceLabelY + chart.costLabelY) / 2}%` }}
							>
								MARGEM
							</span>
						</>
					) : null}
					{chart.markers.map((marker) => (
						<ChartEventMarker
							key={marker.id}
							x={marker.x}
							y={marker.y}
							size={20}
							icon={marker.kind === "COMPRA" ? ShoppingCart : Tag}
							className={marker.kind === "COMPRA" ? "bg-primary text-primary-foreground" : "bg-card text-info"}
							active={hovered === marker.id}
							label={marker.kind === "COMPRA" ? "Compra" : "Alteração de preço"}
							onEnter={() => setHovered(marker.id)}
						/>
					))}
					{activeMarker ? (
						<CostPricePopover
							data={data}
							marker={activeMarker}
							valueAt={chart.valueAt}
							costChanges={chart.costChanges}
							priceChanges={chart.priceChanges}
							unit={unit}
						/>
					) : null}
				</div>
				<div />
				<ChartXAxis ticks={chart.xTicks} height={20} />
				<div className="flex flex-col items-end justify-center" style={{ height: MARGIN_HEIGHT }}>
					<span className="text-muted-foreground text-[10px] font-bold">MARGEM</span>
				</div>
				<div className="border-border relative border-t" style={{ height: MARGIN_HEIGHT }}>
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 inset-y-2 h-[calc(100%-16px)] w-full overflow-visible">
						<path d={chart.marginArea} className="fill-success" fillOpacity={0.08} />
						<path d={chart.marginPath} fill="none" className="stroke-success" strokeWidth={2} vectorEffect="non-scaling-stroke" />
					</svg>
					{resumo.margemInicio != null ? (
						<span className="text-success-strong absolute left-1 top-1.5 text-[10px] font-semibold">{formatFraction(resumo.margemInicio, 1)}</span>
					) : null}
					{resumo.margemAtual != null ? (
						<span className="text-success-strong absolute bottom-1 right-1 text-[10px] font-semibold">{formatFraction(resumo.margemAtual, 1)}</span>
					) : null}
				</div>
			</div>
			<div className="flex flex-[0_1_240px] flex-col justify-center gap-3">
				{summary.map((item) => (
					<div key={item.label} className="border-border flex flex-col gap-0.5 border-b pb-2.5">
						<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{item.label}</span>
						<div className="flex items-baseline justify-between gap-2">
							<span className={cn("text-lg font-bold tabular-nums", item.valueClass)}>{item.value}</span>
							<span className={cn("text-[11px] font-semibold", item.deltaClass)}>{item.delta}</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function CostPricePopover({
	data,
	marker,
	valueAt,
	costChanges,
	priceChanges,
	unit,
}: {
	data: THistory;
	marker: { kind: "COMPRA" | "PRECO"; index: number; x: number; y: number };
	valueAt: (changes: { x: number; value: number }[], x: number) => number;
	costChanges: { x: number; value: number }[];
	priceChanges: { x: number; value: number }[];
	unit: string;
}) {
	const common = { x: marker.x, y: marker.y, flipAt: 62, offset: 16, verticalShift: "-50%", className: "w-[250px]" };
	if (marker.kind === "COMPRA") {
		const purchase = data.compras[marker.index];
		const price = valueAt(priceChanges, marker.x);
		const change = purchase.custoAnterior ? (purchase.custoUnitario - purchase.custoAnterior) / purchase.custoAnterior : null;
		return (
			<ChartFloatingCard {...common}>
				<div className="flex flex-wrap items-center gap-1.5">
					<EventChip icon={ShoppingCart} label="AQUISIÇÃO" className="bg-primary/10 text-primary" />
					<OriginChip label={`Compra · ${purchase.documento}`} />
				</div>
				<span className="text-muted-foreground text-[0.65rem] font-medium">
					{formatDate(purchase.data)}
					{purchase.fornecedor ? ` · ${purchase.fornecedor}` : ""}
				</span>
				<PopoverRow label="Quantidade" value={`+${formatQuantity(purchase.quantidade)} ${unit}`} className="text-success" />
				<PopoverRow label="Custo un." value={formatMoney(purchase.custoUnitario)} />
				{change != null ? (
					<PopoverRow label="Vs. compra anterior" value={formatSignedFraction(change)} className={change > 0 ? "text-red-600" : "text-muted-foreground"} />
				) : null}
				{price > 0 ? (
					<PopoverRow label="Margem resultante" value={formatFraction((price - purchase.custoUnitario) / price, 1)} className="text-success-strong" />
				) : null}
			</ChartFloatingCard>
		);
	}
	const change = data.precos[marker.index];
	const cost = costChanges.length > 0 ? valueAt(costChanges, marker.x) : null;
	return (
		<ChartFloatingCard {...common}>
			<div className="flex flex-wrap items-center gap-1.5">
				<EventChip icon={Tag} label="PREÇO ALTERADO" className="bg-secondary text-secondary-foreground" />
				<OriginChip label={change.origem === "CADASTRO" ? "Cadastro" : "Preço praticado em vendas"} />
			</div>
			<span className="text-muted-foreground text-[0.65rem] font-medium">{formatDayFull(change.dia)}</span>
			<PopoverRow label="De → para" value={`${formatMoney(change.de)} → ${formatMoney(change.para)}`} />
			{change.de > 0 ? (
				<PopoverRow
					label="Reajuste"
					value={formatSignedFraction((change.para - change.de) / change.de)}
					className={change.para >= change.de ? "text-success" : "text-red-600"}
				/>
			) : null}
			{cost != null && change.para > 0 ? (
				<PopoverRow label="Margem resultante" value={formatFraction((change.para - cost) / change.para, 1)} className="text-success-strong" />
			) : null}
		</ChartFloatingCard>
	);
}

function PopoverRow({ label, value, className }: { label: string; value: string; className?: string }) {
	return (
		<div className="flex justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<b className={className}>{value}</b>
		</div>
	);
}

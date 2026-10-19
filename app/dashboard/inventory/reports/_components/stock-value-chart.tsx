"use client";

import type { TGetStockReportValueOutput } from "@/app/api/inventory/reports/stock-value/route";
import {
	ChartCrosshair,
	ChartEventMarker,
	ChartFloatingCard,
	ChartGridLines,
	ChartHoverColumns,
	ChartXAxis,
	ChartYAxis,
	EventChip,
	OriginChip,
} from "@/components/Charts/ChartPrimitives";
import { monotonePath, niceDomain } from "@/lib/charts/geometry";
import { type TStockReportPeriod, useStockReportValue } from "@/lib/queries/inventory-reports";
import { formatCompactMoney, formatDayFull, formatDayShort, formatMoney, formatQuantity, formatSignedMoney } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ReportCard, ReportCardHeader, ReportSectionState } from "./report-section";

type TValueData = TGetStockReportValueOutput["data"];
type TValueEvent = TValueData["eventos"][number];

const CHART_HEIGHT = 200;

export function StockValueChart({ period }: { period: TStockReportPeriod }) {
	const { data, isLoading, error } = useStockReportValue({ period });
	return (
		<ReportCard>
			<ReportCardHeader icon={BadgeDollarSign} title="VALOR IMOBILIZADO">
				<div className="text-foreground/70 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
					<span className="inline-flex items-center gap-1">
						<span className="bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full">
							<ShoppingCart className="size-[9px]" strokeWidth={2.5} />
						</span>
						Compras
					</span>
					<span className="inline-flex items-center gap-1">
						<span className="bg-destructive flex size-4 items-center justify-center rounded-full text-white">
							<Trash2 className="size-[9px]" strokeWidth={2.5} />
						</span>
						Perdas relevantes
					</span>
					{data ? (
						<>
							<span className="text-muted-foreground ml-2 text-[0.65rem] font-medium">HOJE</span>
							<span className="text-foreground text-sm font-semibold tabular-nums">{formatMoney(data.hoje)}</span>
						</>
					) : null}
				</div>
			</ReportCardHeader>
			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-[220px]">
				{data ? <StockValuePlot data={data} /> : null}
			</ReportSectionState>
		</ReportCard>
	);
}

function StockValuePlot({ data }: { data: TValueData }) {
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [activeEventId, setActiveEventId] = useState<string | null>(null);
	const [pinnedEventId, setPinnedEventId] = useState<string | null>(null);

	const chart = useMemo(() => {
		const count = data.serie.length;
		const values = data.serie.map((point) => point.valor);
		const domain = niceDomain(Math.min(...values) * 0.97, Math.max(...values) * 1.02, 4);
		const y = (value: number) => 100 - ((value - domain.min) / (domain.max - domain.min || 1)) * 90;
		const xs = data.serie.map((_, index) => ((index + 0.5) / count) * 100);
		const ys = values.map(y);
		const line = monotonePath(xs, ys);
		const area = count > 0 ? `${line} L${xs[count - 1].toFixed(3)},100 L${xs[0].toFixed(3)},100 Z` : "";
		const every = count <= 31 ? 5 : count <= 60 ? 8 : 15;
		const xTicks: { x: number; label: string }[] = [];
		for (let index = count - 1; index >= 0; index -= every) {
			xTicks.push({ x: xs[index], label: index === count - 1 ? "Hoje" : formatDayShort(data.serie[index].dia) });
		}
		const markers = data.eventos
			.map((event) => {
				const index = data.serie.findIndex((point) => event.dia >= point.inicio && event.dia <= point.dia);
				return index >= 0 ? { event, x: xs[index], y: ys[index] } : null;
			})
			.filter((marker): marker is { event: TValueEvent; x: number; y: number } => !!marker);
		return { xs, ys, line, area, xTicks, markers, yTicks: domain.ticks.map((value) => ({ y: y(value), label: formatCompactMoney(value) })) };
	}, [data]);

	if (data.serie.length === 0) {
		return <div className="text-muted-foreground py-10 text-center text-xs">Sem dados de estoque no período.</div>;
	}

	const eventId = pinnedEventId ?? activeEventId;
	const activeMarker = chart.markers.find((marker) => marker.event.id === eventId) ?? null;
	const hovered = !activeMarker && hoverIndex != null ? data.serie[hoverIndex] : null;

	return (
		<div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2">
			<ChartYAxis ticks={chart.yTicks} height={CHART_HEIGHT} />
			<div
				className="relative"
				style={{ height: CHART_HEIGHT }}
				onMouseLeave={() => {
					setHoverIndex(null);
					setActiveEventId(null);
				}}
			>
				<ChartGridLines ticks={chart.yTicks} />
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible text-info">
					<defs>
						<linearGradient id="stock-value-fill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="5%" stopColor="currentColor" stopOpacity={0.22} />
							<stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
						</linearGradient>
					</defs>
					<path d={chart.area} fill="url(#stock-value-fill)" />
					<path d={chart.line} fill="none" stroke="currentColor" strokeWidth={2.25} vectorEffect="non-scaling-stroke" />
				</svg>
				<ChartHoverColumns count={data.serie.length} onEnter={setHoverIndex} />
				{hovered && hoverIndex != null ? (
					<>
						<ChartCrosshair x={chart.xs[hoverIndex]} y={chart.ys[hoverIndex]} />
						<ChartFloatingCard x={chart.xs[hoverIndex]} flipAt={70} offset={10} className="gap-0.5 whitespace-nowrap px-2.5 py-2">
							<span className="font-semibold">
								{data.granularidade === "SEMANA" ? `${formatDayFull(hovered.inicio)} – ${formatDayFull(hovered.dia)}` : formatDayFull(hovered.dia)}
							</span>
							<span className="text-muted-foreground">
								Imobilizado <b className="text-foreground">{formatMoney(hovered.valor)}</b>
							</span>
						</ChartFloatingCard>
					</>
				) : null}
				{chart.markers.map(({ event, x, y }) => (
					<ChartEventMarker
						key={event.id}
						x={x}
						y={y}
						icon={event.tipo === "COMPRA" ? ShoppingCart : Trash2}
						className={event.tipo === "COMPRA" ? "bg-primary text-primary-foreground" : "bg-destructive text-white"}
						active={eventId === event.id}
						label={`${event.tipo === "COMPRA" ? "Compra" : "Perda"} em ${formatDayFull(event.dia)}`}
						onEnter={() => {
							setActiveEventId(event.id);
							setHoverIndex(null);
						}}
						onLeave={() => setActiveEventId(null)}
						onClick={() => setPinnedEventId((current) => (current === event.id ? null : event.id))}
					/>
				))}
				{activeMarker ? <StockValueEventPopover event={activeMarker.event} x={activeMarker.x} y={Math.min(activeMarker.y, 40)} /> : null}
			</div>
			<div />
			<ChartXAxis ticks={chart.xTicks} height={20} />
		</div>
	);
}

function StockValueEventPopover({ event, x, y }: { event: TValueEvent; x: number; y: number }) {
	const isPurchase = event.tipo === "COMPRA";
	return (
		<ChartFloatingCard x={x} y={y} verticalShift="-10%" className="w-[290px]">
			<div className="flex flex-wrap items-center gap-1.5">
				<EventChip
					icon={isPurchase ? ShoppingCart : Trash2}
					label={isPurchase ? "AQUISIÇÃO" : "DESCARTE"}
					className={isPurchase ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}
				/>
				<OriginChip label={isPurchase ? `Compra · ${event.origem}` : event.origem} />
			</div>
			{event.descricao ? <span className="text-foreground/70">{event.descricao}</span> : null}
			<span className="text-muted-foreground text-[0.65rem] font-medium">{formatDayFull(event.dia)}</span>
			<div className="border-border flex flex-col gap-1 border-t pt-2">
				{event.itens.map((item) => (
					<div key={item.nome} className="flex justify-between gap-3">
						<span className="truncate">
							{item.nome} · {formatQuantity(item.quantidade)} un
						</span>
						<b className="whitespace-nowrap">{formatMoney(item.valor)}</b>
					</div>
				))}
				{event.itensTotal > event.itens.length ? (
					<span className="text-muted-foreground">
						+{event.itensTotal - event.itens.length} {event.itensTotal - event.itens.length === 1 ? "item" : "itens"}
					</span>
				) : null}
			</div>
			<div className="border-border flex justify-between border-t pt-2">
				<span className="text-muted-foreground">Impacto no imobilizado</span>
				<b className={cn(event.total > 0 ? "text-success" : "text-red-600")}>{formatSignedMoney(event.total)}</b>
			</div>
		</ChartFloatingCard>
	);
}

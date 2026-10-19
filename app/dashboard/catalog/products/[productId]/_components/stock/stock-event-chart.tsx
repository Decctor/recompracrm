"use client";

import type { TProductStockAnalytics, TProductStockEventOrigin, TProductStockEventType } from "@/app/api/products/stock-analytics/route";
import {
	ChartCrosshair,
	ChartEventMarker,
	ChartFloatingCard,
	ChartGridLines,
	ChartHoverColumns,
	ChartXAxis,
	ChartYAxis,
	EventChip,
	LegendItem,
	OriginChip,
} from "@/components/Charts/ChartPrimitives";
import { monotonePath, niceDomain } from "@/lib/charts/geometry";
import {
	formatDateTime,
	formatDayFull,
	formatDayMonth,
	formatDayShort,
	formatMoney,
	formatQuantity,
	formatSignedFraction,
} from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import {
	ArrowDownRight,
	ArrowUpRight,
	ChartSpline,
	Diamond,
	Factory,
	Hand,
	Info,
	Layers,
	type LucideIcon,
	MoveRight,
	PackagePlus,
	ShoppingBag,
	ShoppingCart,
	Trash2,
	UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type TEvent = TProductStockAnalytics["eventos"][number];

export const STOCK_EVENT_TYPES: Record<
	TProductStockEventType,
	{ label: string; pill: string; icon: LucideIcon; chip: string; marker: string; pillActive: string }
> = {
	COMPRA: {
		label: "AQUISIÇÃO",
		pill: "Compras",
		icon: ShoppingCart,
		chip: "bg-primary/10 text-primary",
		marker: "bg-primary text-primary-foreground",
		pillActive: "border-primary/20 bg-primary/10 text-primary",
	},
	PRODUCAO: {
		label: "PRODUÇÃO",
		pill: "Produção",
		icon: PackagePlus,
		chip: "bg-primary/10 text-primary",
		marker: "bg-card text-primary",
		pillActive: "border-primary/20 bg-primary/10 text-primary",
	},
	DESCARTE: {
		label: "DESCARTE",
		pill: "Descartes",
		icon: Trash2,
		chip: "bg-destructive/10 text-destructive",
		marker: "bg-destructive text-white",
		pillActive: "border-destructive/20 bg-destructive/10 text-destructive",
	},
	VENDA: {
		label: "VENDA / SAÍDA",
		pill: "Grandes vendas",
		icon: ShoppingBag,
		chip: "bg-muted text-foreground/70",
		marker: "bg-warning text-warning-foreground",
		pillActive: "border-warning/35 bg-warning/20 text-foreground",
	},
};

const ORIGIN_ICONS: Record<TProductStockEventOrigin["tipo"], LucideIcon> = {
	COMPRA: ShoppingCart,
	VENDA: ShoppingBag,
	PRODUCAO: Factory,
	LOTE: Layers,
	MANUAL: Hand,
	VARIANTE: Diamond,
};

function originLabel(origin: TProductStockEventOrigin) {
	if (origin.tipo === "COMPRA") return `Compra · ${origin.rotulo}`;
	if (origin.tipo === "VENDA") return `Venda · ${origin.rotulo}`;
	if (origin.tipo === "PRODUCAO") return `Produção · ${origin.rotulo}`;
	if (origin.tipo === "LOTE") return `Lote · ${origin.rotulo}`;
	return origin.rotulo;
}

/** Leitura curta do evento: custo contra a compra anterior, ou o tamanho da venda frente ao consumo. */
function eventInsight(event: TEvent) {
	if (event.tipo === "COMPRA" && event.custoCompraAnterior != null && event.custoUnitario != null && event.custoCompraAnterior > 0) {
		const change = (event.custoUnitario - event.custoCompraAnterior) / event.custoCompraAnterior;
		return Math.abs(change) < 0.0005 ? "Custo igual à compra anterior" : `Custo ${formatSignedFraction(change)} vs. compra anterior`;
	}
	if (event.tipo === "VENDA" && event.multiploConsumo != null) return `${formatQuantity(event.multiploConsumo, 1)}× o consumo médio diário`;
	return null;
}

const CHART_HEIGHT = 260;
const BARS_HEIGHT = 84;

export function StockEventChart({ analytics }: { analytics: TProductStockAnalytics }) {
	const { serie, eventos, reposicao, kpis, produto } = analytics;
	const [filters, setFilters] = useState<Record<TProductStockEventType, boolean>>({ COMPRA: true, PRODUCAO: true, DESCARTE: true, VENDA: true });
	const [hoverDay, setHoverDay] = useState<number | null>(null);
	const [hoverEvent, setHoverEvent] = useState<string | null>(null);
	const [pinnedEvent, setPinnedEvent] = useState<string | null>(null);
	const hasConsumption = kpis.consumoMedioDia > 0;
	const unit = produto.unidade;

	const chart = useMemo(() => {
		const n = serie.length;
		const projectionSlots = hasConsumption ? Math.max(3, Math.round(n * 0.2)) : 0;
		const slot = 100 / (n + projectionSlots);
		const xs = serie.map((_, index) => (index + 0.5) * slot);
		const balances = serie.map((point) => point.saldo);
		const domain = niceDomain(0, Math.max(...balances, hasConsumption ? reposicao.pontoPedido : 0, 1) * 1.12, 4, { includeZero: true });
		const y = (value: number) => 100 - (Math.max(value, domain.min) / (domain.max || 1)) * 88;
		const ys = balances.map(y);
		const line = monotonePath(xs, ys);
		const area = n > 0 ? `${line} L${xs[n - 1].toFixed(3)},100 L${xs[0].toFixed(3)},100 Z` : "";
		const ruptureX = kpis.coberturaDias != null && n > 0 ? Math.min(99, xs[n - 1] + kpis.coberturaDias * slot) : null;
		const projection = hasConsumption && ruptureX != null ? `M${xs[n - 1]},${ys[n - 1]} L${ruptureX},100` : "";
		const every = n <= 7 ? 1 : n <= 30 ? 5 : 15;
		const xTicks: { x: number; label: string }[] = [];
		for (let index = n - 1; index >= 0; index -= every)
			xTicks.push({ x: xs[index], label: index === n - 1 ? "Hoje" : formatDayShort(serie[index].dia) });
		const maxIn = Math.max(1, ...serie.map((point) => point.entradas));
		const maxOut = Math.max(1, ...serie.map((point) => point.saidas));
		const dayIndex = new Map(serie.map((point, index) => [point.dia, index]));
		return {
			slot,
			xs,
			ys,
			line,
			area,
			projection,
			ruptureX,
			xTicks,
			maxIn,
			maxOut,
			dayIndex,
			todayX: n > 0 ? xs[n - 1] : 0,
			todayEdge: n * slot,
			ropY: y(reposicao.pontoPedido),
			safetyY: y(reposicao.estoqueSeguranca),
			yTicks: domain.ticks.map((value) => ({ y: y(value), label: formatQuantity(value, 0) })),
		};
	}, [serie, hasConsumption, reposicao.pontoPedido, reposicao.estoqueSeguranca, kpis.coberturaDias]);

	const markers = eventos
		.filter((event) => filters[event.tipo])
		.map((event) => {
			const index = chart.dayIndex.get(event.dia);
			return index == null ? null : { event, index, x: chart.xs[index], y: chart.ys[index] };
		})
		.filter((marker): marker is { event: TEvent; index: number; x: number; y: number } => !!marker);

	const activeEventId = pinnedEvent ?? hoverEvent;
	const activeMarker = markers.find((marker) => marker.event.id === activeEventId) ?? null;
	const hovered = !activeMarker && hoverDay != null ? serie[hoverDay] : null;
	const highlightedDay = activeMarker?.index ?? hoverDay;

	return (
		<div className="bg-card border-border flex flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<ChartSpline className="size-4" />
					<h3 className="text-xs font-medium leading-none tracking-tight">SALDO E MOVIMENTAÇÕES</h3>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground text-[0.65rem] font-semibold uppercase tracking-wide">Eventos</span>
					{(Object.keys(STOCK_EVENT_TYPES) as TProductStockEventType[]).map((type) => {
						const config = STOCK_EVENT_TYPES[type];
						const active = filters[type];
						return (
							<button
								key={type}
								type="button"
								aria-pressed={active}
								onClick={() => setFilters((current) => ({ ...current, [type]: !current[type] }))}
								className={cn(
									"inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
									active ? config.pillActive : "border-border bg-card text-muted-foreground",
								)}
							>
								<config.icon className="size-3" />
								{config.pill}
								<span className="opacity-70">{eventos.filter((event) => event.tipo === type).length}</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="grid grid-cols-[40px_minmax(0,1fr)_44px] gap-x-2">
				<ChartYAxis ticks={chart.yTicks} height={CHART_HEIGHT} />
				<div
					className="relative"
					style={{ height: CHART_HEIGHT }}
					onMouseLeave={() => {
						setHoverDay(null);
						setHoverEvent(null);
					}}
				>
					<ChartGridLines ticks={chart.yTicks} />
					{hasConsumption ? (
						<div
							className="border-ring absolute inset-y-0 right-0 border-l border-dashed bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_9px)]"
							style={{ left: `${chart.todayX}%` }}
						>
							<span className="text-muted-foreground absolute left-1.5 top-1 text-[10px] font-bold tracking-[0.06em]">PROJEÇÃO</span>
						</div>
					) : null}
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="text-info absolute inset-0 size-full overflow-visible">
						<defs>
							<linearGradient id="product-stock-fill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="currentColor" stopOpacity={0.22} />
								<stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
							</linearGradient>
						</defs>
						<path d={chart.area} fill="url(#product-stock-fill)" />
						<path d={chart.line} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
						{chart.projection ? (
							<path d={chart.projection} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
						) : null}
					</svg>
					{hasConsumption ? (
						<>
							<ReferenceLine
								y={chart.ropY}
								className="border-[#e3b042]"
								labelClassName="text-[#9a691e]"
								label={`PONTO DE PEDIDO · ${formatQuantity(reposicao.pontoPedido)}`}
							/>
							<ReferenceLine
								y={chart.safetyY}
								className="border-destructive/55"
								labelClassName="text-destructive-surface-foreground"
								label={`SEGURANÇA · ${formatQuantity(reposicao.estoqueSeguranca)}`}
							/>
						</>
					) : null}
					{chart.ruptureX != null && reposicao.rupturaPrevista != null ? (
						<>
							<div
								className="border-destructive bg-card absolute top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
								style={{ left: `${chart.ruptureX}%` }}
							/>
							<div className="bg-destructive-surface text-destructive-surface-foreground absolute right-1 top-[22px] whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.04em]">
								RUPTURA ~{formatDayMonth(reposicao.rupturaPrevista)}
							</div>
						</>
					) : null}
					<ChartHoverColumns
						count={serie.length}
						width={chart.todayEdge}
						onEnter={(index) => {
							if (!pinnedEvent) setHoverDay(index);
						}}
					/>
					{hovered && hoverDay != null ? (
						<>
							<ChartCrosshair x={chart.xs[hoverDay]} y={chart.ys[hoverDay]} />
							<ChartFloatingCard x={chart.xs[hoverDay]} flipAt={70} offset={10} className="min-w-[150px] gap-1 px-2.5 py-2">
								<span className="font-semibold">{formatDayFull(hovered.dia)}</span>
								<TooltipRow label="Saldo" value={`${formatQuantity(hovered.saldo)} ${unit}`} />
								<TooltipRow label="Entradas" value={hovered.entradas ? `+${formatQuantity(hovered.entradas)}` : "0"} className="text-success" />
								<TooltipRow label="Saídas" value={hovered.saidas ? `−${formatQuantity(hovered.saidas)}` : "0"} className="text-red-600" />
							</ChartFloatingCard>
						</>
					) : null}
					{markers.map(({ event, x, y }) => {
						const config = STOCK_EVENT_TYPES[event.tipo];
						return (
							<ChartEventMarker
								key={event.id}
								x={x}
								y={y}
								icon={config.icon}
								className={config.marker}
								active={activeEventId === event.id}
								label={`${config.label} em ${formatDayFull(event.dia)}`}
								onEnter={() => {
									setHoverEvent(event.id);
									setHoverDay(null);
								}}
								onLeave={() => setHoverEvent(null)}
								onClick={() => setPinnedEvent((current) => (current === event.id ? null : event.id))}
							/>
						);
					})}
					{activeMarker ? <StockEventPopover event={activeMarker.event} x={activeMarker.x} y={Math.min(activeMarker.y, 62)} unit={unit} /> : null}
				</div>
				<div />

				<div />
				<ChartXAxis ticks={chart.xTicks} />
				<div />

				<div className="relative" style={{ height: BARS_HEIGHT }}>
					<span className="text-success absolute right-0 top-0 text-[10px] font-bold">ENTR.</span>
					<span className="absolute bottom-0 right-0 text-[10px] font-bold text-red-600">SAÍDAS</span>
				</div>
				<div className="border-border relative border-t" style={{ height: BARS_HEIGHT }}>
					<div className="border-border absolute inset-x-0 top-1/2 border-t" />
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 top-1.5 h-[calc(100%-6px)] w-full">
						{serie.map((point, index) => {
							const x = chart.xs[index] - chart.slot * 0.32;
							const width = chart.slot * 0.64;
							const dimmed = highlightedDay != null && highlightedDay !== index;
							const upHeight = (point.entradas / chart.maxIn) * 48;
							return (
								<g key={point.dia}>
									<rect x={x} y={50 - upHeight} width={width} height={upHeight} className="fill-success" fillOpacity={dimmed ? 0.45 : 0.9} rx={0.3} />
									<rect
										x={x}
										y={50}
										width={width}
										height={(point.saidas / chart.maxOut) * 48}
										className="fill-red-600"
										fillOpacity={dimmed ? 0.35 : 0.75}
										rx={0.3}
									/>
								</g>
							);
						})}
					</svg>
					{highlightedDay != null ? <ChartCrosshair x={chart.xs[highlightedDay]} /> : null}
				</div>
				<div className="text-muted-foreground relative text-[11px] tabular-nums" style={{ height: BARS_HEIGHT }}>
					<span className="absolute left-0 top-1">+{formatQuantity(chart.maxIn)}</span>
					<span className="absolute left-0 top-1/2 -translate-y-1/2">0</span>
					<span className="absolute bottom-0 left-0">−{formatQuantity(chart.maxOut)}</span>
				</div>
			</div>

			<div className="text-foreground/70 flex flex-wrap justify-center gap-4 text-[11px] font-semibold">
				<LegendItem swatch={<span className="bg-info h-[3px] w-3.5 rounded-sm" />} label="SALDO" />
				{hasConsumption ? <LegendItem swatch={<span className="border-info w-3.5 border-t-2 border-dashed" />} label="PROJEÇÃO" /> : null}
				<LegendItem swatch={<span className="bg-success size-2.5 rounded-[3px]" />} label="ENTRADAS" />
				<LegendItem swatch={<span className="size-2.5 rounded-[3px] bg-red-600 opacity-70" />} label="SAÍDAS" />
				{hasConsumption ? (
					<>
						<LegendItem swatch={<span className="w-3.5 border-t-2 border-dashed border-[#e3b042]" />} label="PONTO DE PEDIDO" />
						<LegendItem swatch={<span className="border-destructive/55 w-3.5 border-t-2 border-dashed" />} label="ESTOQUE DE SEGURANÇA" />
					</>
				) : null}
			</div>
		</div>
	);
}

function ReferenceLine({ y, label, className, labelClassName }: { y: number; label: string; className: string; labelClassName: string }) {
	return (
		<div className={cn("pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed", className)} style={{ top: `${y}%` }}>
			<span
				className={cn(
					"bg-card/85 absolute -top-[17px] left-1 whitespace-nowrap rounded px-[3px] text-[10px] font-bold tracking-[0.04em]",
					labelClassName,
				)}
			>
				{label}
			</span>
		</div>
	);
}

function TooltipRow({ label, value, className }: { label: string; value: string; className?: string }) {
	return (
		<div className="flex justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<b className={className}>{value}</b>
		</div>
	);
}

/** Popover do evento: o mesmo desenho da linha de movimentação, com a leitura do evento no rodapé. */
function StockEventPopover({ event, x, y, unit }: { event: TEvent; x: number; y: number; unit: string }) {
	const config = STOCK_EVENT_TYPES[event.tipo];
	const insight = eventInsight(event);
	const inflow = event.quantidade > 0;
	return (
		<ChartFloatingCard x={x} y={y} className="pointer-events-auto w-[300px]">
			<div className="flex flex-wrap items-center gap-1.5">
				<EventChip icon={config.icon} label={config.label} className={config.chip} />
				{event.origens.map((origin) => (
					<OriginChip key={`${origin.tipo}-${origin.rotulo}`} icon={ORIGIN_ICONS[origin.tipo]} label={originLabel(origin)} />
				))}
			</div>
			{event.motivo ? <p className="text-foreground/70">{event.motivo}</p> : null}
			<div className="text-muted-foreground flex flex-wrap gap-3 text-[0.65rem] font-medium">
				{event.operador ? (
					<span className="inline-flex items-center gap-1">
						<UserRound className="size-3" />
						{event.operador}
					</span>
				) : null}
				<span>{formatDateTime(event.data)}</span>
			</div>
			<div className="border-border flex items-end justify-between gap-3 border-t pt-2">
				<PopoverMetric label="Saldo">
					<span className="inline-flex items-center gap-1 text-xs font-semibold">
						<span className="text-muted-foreground">{formatQuantity(event.saldoAnterior)}</span>
						<MoveRight className="size-3" />
						<span>
							{formatQuantity(event.saldoPosterior)} {unit}
						</span>
					</span>
				</PopoverMetric>
				{event.custoUnitario != null ? (
					<PopoverMetric label="Custo un." align="end">
						<span className="text-xs font-semibold">{formatMoney(event.custoUnitario)}</span>
					</PopoverMetric>
				) : null}
				<PopoverMetric label="Movimento" align="end">
					<span className={cn("inline-flex items-center gap-1 text-base font-bold", inflow ? "text-success" : "text-red-600")}>
						{inflow ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
						{inflow ? "+" : "-"}
						{formatQuantity(Math.abs(event.quantidade))}
					</span>
				</PopoverMetric>
			</div>
			{insight ? (
				<div className="bg-muted text-foreground/80 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold">
					<Info className="size-3" />
					{insight}
				</div>
			) : null}
		</ChartFloatingCard>
	);
}

function PopoverMetric({ label, align = "start", children }: { label: string; align?: "start" | "end"; children: React.ReactNode }) {
	return (
		<div className={cn("flex flex-col gap-0.5", align === "end" && "items-end")}>
			<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">{label}</span>
			{children}
		</div>
	);
}

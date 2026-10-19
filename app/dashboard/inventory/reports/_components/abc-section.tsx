"use client";

import type { TGetStockReportAbcOutput } from "@/app/api/inventory/reports/abc/route";
import { ChartFloatingCard, ChartHoverColumns } from "@/components/Charts/ChartPrimitives";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { monotonePath } from "@/lib/charts/geometry";
import { type TStockReportAbcMetric, type TStockReportPeriod, useStockReportAbc } from "@/lib/queries/inventory-reports";
import { formatFraction, formatMoney, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { ChartPie } from "lucide-react";
import { useMemo, useState } from "react";
import { ReportCard, ReportSection, ReportSectionState } from "./report-section";

type TAbcData = TGetStockReportAbcOutput["data"];

/** Cores das classes, as mesmas do selo de classe nas tabelas. */
export const ABC_CLASS_STYLES = {
	A: { badge: "bg-primary text-primary-foreground", band: "bg-primary/[0.06]", label: "text-primary" },
	B: { badge: "bg-[#e3b042] text-[#171717]", band: "bg-[#e3b042]/10", label: "text-[#9a691e]" },
	C: { badge: "bg-muted text-muted-foreground", band: "bg-muted/50", label: "text-muted-foreground" },
} as const;

const CLASS_HINTS = {
	A: "Controle rigoroso: nunca pode faltar",
	B: "Revisão periódica de saldo e preço",
	C: "Candidatos a reduzir mix ou compra",
} as const;

/** Colunas de hover: no máximo esta quantidade, cada uma cobrindo um grupo de produtos. */
const HOVER_COLUMNS = 52;
const CHART_HEIGHT = 240;

export function AbcSection({ period }: { period: TStockReportPeriod }) {
	const [metric, setMetric] = useState<TStockReportAbcMetric>("FATURAMENTO");
	const { data, isLoading, error } = useStockReportAbc({ period, metric });
	const total = data?.totalProdutos ?? 0;

	return (
		<ReportSection
			id="abc"
			icon={ChartPie}
			title="Curva ABC"
			description={`${total > 0 ? `${formatQuantity(total)} produtos` : "Produtos"} ordenados pela participação. Classe A até 80% acumulado, B até 95%, C o restante.`}
			actions={
				<SegmentedControl
					aria-label="Métrica da curva ABC"
					value={metric}
					onChange={setMetric}
					options={[
						{ value: "FATURAMENTO", label: "Faturamento" },
						{ value: "VOLUME", label: "Volume" },
					]}
				/>
			}
		>
			<ReportSectionState
				isLoading={isLoading}
				error={error}
				isEmpty={!!data && data.totalProdutos === 0}
				emptyMessage="Nenhum produto com rastreamento de estoque."
				skeletonClassName="h-64"
			>
				{data ? (
					<div className="flex flex-wrap gap-4">
						<ReportCard className="min-w-0 flex-[1_1_520px]">
							<AbcChart data={data} />
						</ReportCard>
						<div className="flex flex-[1_1_260px] flex-col gap-2">
							{(["A", "B", "C"] as const).map((classe) => {
								const summary = data.classes[classe];
								return (
									<div key={classe} className="bg-card border-border flex items-center gap-3 rounded-xl border px-3.5 py-3 shadow-2xs">
										<div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-xl font-extrabold", ABC_CLASS_STYLES[classe].badge)}>
											{classe}
										</div>
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="text-sm font-semibold">
												{formatQuantity(summary.produtos)} produtos{" "}
												<span className="text-muted-foreground font-normal">· {formatFraction(summary.participacaoCatalogo)} do catálogo</span>
											</span>
											<span className="text-muted-foreground text-xs">{CLASS_HINTS[classe]}</span>
										</div>
										<div className="flex flex-col items-end gap-0.5">
											<span className="text-info text-lg font-bold tabular-nums">{formatFraction(summary.participacao)}</span>
											<span className="text-muted-foreground whitespace-nowrap text-[11px] tabular-nums">
												{metric === "VOLUME" ? `${formatQuantity(summary.valor)} un` : formatMoney(summary.valor)}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
			</ReportSectionState>
		</ReportSection>
	);
}

function AbcChart({ data }: { data: TAbcData }) {
	const [hoverColumn, setHoverColumn] = useState<number | null>(null);
	const count = data.curva.length;

	const chart = useMemo(() => {
		const barWidth = 100 / count;
		const maxShare = Math.max(...data.curva.map((item) => item.participacao), 1e-9);
		const paths = { A: "", B: "", C: "" };
		data.curva.forEach((item, index) => {
			const height = (item.participacao / maxShare) * 96;
			paths[item.classe] +=
				`M${(index * barWidth + barWidth * 0.12).toFixed(3)},100 h${(barWidth * 0.76).toFixed(3)} v${(-height).toFixed(3)} h${(-barWidth * 0.76).toFixed(3)} Z `;
		});
		const step = Math.max(1, Math.ceil(count / 120));
		const xs = [0];
		const ys = [100];
		for (let index = 0; index < count; index += step) {
			xs.push((index + 1) * barWidth);
			ys.push(100 - data.curva[index].acumulado * 100);
		}
		xs.push(100);
		ys.push(100 - (data.curva[count - 1]?.acumulado ?? 0) * 100);
		const aCount = data.classes.A.produtos;
		const bCount = data.classes.B.produtos;
		return { barWidth, paths, curve: monotonePath(xs, ys), aWidth: aCount * barWidth, bWidth: bCount * barWidth };
	}, [data, count]);

	const columns = Math.min(HOVER_COLUMNS, count);
	const perColumn = count / Math.max(1, columns);
	const hoveredIndex = hoverColumn != null ? Math.min(count - 1, Math.floor(hoverColumn * perColumn)) : null;
	const hovered = hoveredIndex != null ? data.curva[hoveredIndex] : null;
	const hoveredX = hoveredIndex != null ? (hoveredIndex + 0.5) * chart.barWidth : 0;

	return (
		<div className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-2">
			<div className="relative" style={{ height: CHART_HEIGHT }}>
				{[0, 25, 50, 75, 100].map((percent) => (
					<span key={percent} className="text-muted-foreground absolute right-0 -translate-y-1/2 text-[11px]" style={{ top: `${100 - percent}%` }}>
						{percent}%
					</span>
				))}
			</div>
			<div className="border-border relative border-b" style={{ height: CHART_HEIGHT }} onMouseLeave={() => setHoverColumn(null)}>
				<AbcBand classe="A" left={0} width={chart.aWidth} />
				<AbcBand classe="B" left={chart.aWidth} width={chart.bWidth} />
				<AbcBand classe="C" left={chart.aWidth + chart.bWidth} width={100 - chart.aWidth - chart.bWidth} />
				<div className="border-ring pointer-events-none absolute inset-x-0 top-[20%] border-t border-dashed" />
				<div className="border-ring pointer-events-none absolute inset-x-0 top-[5%] border-t border-dashed" />
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
					<path d={chart.paths.A} className="fill-info" fillOpacity={0.85} />
					<path d={chart.paths.B} className="fill-[#e3b042]" />
					<path d={chart.paths.C} className="fill-ring" />
					<path d={chart.curve} fill="none" className="stroke-foreground" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
				</svg>
				<ChartHoverColumns count={columns} onEnter={setHoverColumn} />
				{hovered && hoveredIndex != null ? (
					<>
						<div className="bg-foreground/25 pointer-events-none absolute inset-y-0 w-px" style={{ left: `${hoveredX}%` }} />
						<ChartFloatingCard x={hoveredX} flipAt={65} offset={10} className="gap-[3px] whitespace-nowrap px-2.5 py-2" style={{ top: 28 }}>
							<span className="font-semibold">{hovered.nome}</span>
							<span className="text-muted-foreground">
								{hovered.posicao}º · classe <b className="text-foreground">{hovered.classe}</b>
							</span>
							<span className="text-muted-foreground">
								Participação <b className="text-foreground">{formatFraction(hovered.participacao, 1)}</b> · acumulado{" "}
								<b className="text-foreground">{formatFraction(hovered.acumulado, 1)}</b>
							</span>
						</ChartFloatingCard>
					</>
				) : null}
			</div>
			<div />
			<div className="text-muted-foreground flex justify-between pt-1.5 text-[11px]">
				<span>1º</span>
				<span>Produtos ordenados por {data.metrica === "VOLUME" ? "unidades vendidas" : "faturamento"}</span>
				<span>{count}º</span>
			</div>
		</div>
	);
}

function AbcBand({ classe, left, width }: { classe: "A" | "B" | "C"; left: number; width: number }) {
	if (width <= 0) return null;
	return (
		<div className={cn("pointer-events-none absolute inset-y-0", ABC_CLASS_STYLES[classe].band)} style={{ left: `${left}%`, width: `${width}%` }}>
			<span className={cn("absolute left-1.5 top-1.5 text-[11px] font-extrabold", ABC_CLASS_STYLES[classe].label)}>{classe}</span>
		</div>
	);
}

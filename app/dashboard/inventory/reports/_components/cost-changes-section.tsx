"use client";

import { type TStockReportPeriod, useStockReportCostChanges } from "@/lib/queries/inventory-reports";
import { formatDate, formatFraction, formatMoney, formatPercentagePoints, formatSignedFraction } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, MoveRight, TrendingUp } from "lucide-react";
import { ReportSection, ReportSectionState } from "./report-section";

const GRID = "grid grid-cols-[minmax(220px,2fr)_1.4fr_120px_0.8fr_1fr] gap-3";

/** Sparkline em degraus dos últimos custos de compra. */
function sparklinePath(values: number[]) {
	if (values.length < 2) return "";
	const low = Math.min(...values);
	const range = Math.max(...values) - low || 1;
	const step = 100 / (values.length - 1);
	return values
		.map((value, index) => `${index ? ` H${(index * step).toFixed(2)} V` : "M0,"}${(90 - ((value - low) / range) * 80).toFixed(2)}`)
		.join("");
}

export function CostChangesSection({ period }: { period: TStockReportPeriod }) {
	const { data, isLoading, error } = useStockReportCostChanges({ period });
	return (
		<ReportSection
			id="custos"
			icon={TrendingUp}
			title="Variação de custo de compra"
			description="Maiores variações entre a última compra e a anterior, com o efeito na margem ao preço atual."
		>
			<ReportSectionState
				isLoading={isLoading}
				error={error}
				isEmpty={!!data && data.itens.length === 0}
				emptyMessage="Nenhuma variação de custo entre compras no período."
			>
				{data ? (
					<div className="bg-card border-border overflow-auto rounded-xl border shadow-2xs">
						<div className="min-w-[760px]">
							<div className={cn(GRID, "border-border text-muted-foreground border-b px-3.5 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide")}>
								<span>Produto</span>
								<span>Custo unitário (anterior → última compra)</span>
								<span>Últimas compras</span>
								<span className="text-right">Variação</span>
								<span className="text-right">Margem</span>
							</div>
							{data.itens.map((item) => {
								const up = item.variacao > 0;
								const marginDown = item.margemVariacao != null && item.margemVariacao < 0;
								return (
									<div
										key={`${item.produtoId}:${item.produtoVarianteId ?? ""}`}
										className={cn(GRID, "border-border items-center border-b px-3.5 py-2.5 last:border-b-0")}
									>
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-bold tracking-tight">{item.nome}</span>
											<span className="text-foreground/70 text-[0.65rem] font-medium">
												{item.fornecedor ?? "Fornecedor não informado"} · {formatDate(item.data)}
											</span>
										</div>
										<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
											<span className="text-muted-foreground">{formatMoney(item.custoAnterior)}</span>
											<MoveRight className="size-3" />
											{formatMoney(item.custoUltimo)}
										</span>
										<svg
											viewBox="0 0 100 100"
											preserveAspectRatio="none"
											className={cn("h-[26px] w-[110px] overflow-visible", up ? "text-red-600" : "text-success")}
										>
											<path d={sparklinePath(item.historico)} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
										</svg>
										<span className={cn("inline-flex items-center justify-end gap-1 text-sm font-bold tabular-nums", up ? "text-red-600" : "text-success")}>
											{up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
											{formatSignedFraction(item.variacao)}
										</span>
										<div className="flex flex-col items-end">
											<span className="text-[13px] font-semibold tabular-nums">{item.margemAtual != null ? formatFraction(item.margemAtual, 1) : "—"}</span>
											{item.margemVariacao != null ? (
												<span className={cn("text-[11px] font-semibold", marginDown ? "text-red-600" : "text-success")}>
													{formatPercentagePoints(item.margemVariacao)}
												</span>
											) : null}
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

"use client";

import { type TStockReportPeriod, useStockReportLosses } from "@/lib/queries/inventory-reports";
import { formatDayShort, formatFraction, formatMoney, formatMonthShort, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { CalendarRange, List, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { ReportCard, ReportCardHeader, ReportSection, ReportSectionState } from "./report-section";

/** "21–27 set", "28 set–4 out", ou o mês nas barras mensais. */
function formatBucketLabel(inicio: string, fim: string, monthly: boolean) {
	if (monthly) return formatMonthShort(inicio);
	if (inicio === fim) return formatDayShort(inicio);
	const [startDay, startMonth] = formatDayShort(inicio).split(" ");
	const end = formatDayShort(fim);
	return startMonth === end.split(" ")[1] ? `${startDay}–${end}` : `${startDay} ${startMonth}–${end}`;
}

export function LossesSection({ period }: { period: TStockReportPeriod }) {
	const { data, isLoading, error } = useStockReportLosses({ period });
	const maxBucket = Math.max(1e-9, ...(data?.serie.map((bucket) => bucket.valor) ?? []));
	const maxReason = Math.max(1e-9, ...(data?.porMotivo.map((reason) => reason.valor) ?? []));
	const change = data && data.anterior > 0 ? (data.total - data.anterior) / data.anterior : null;
	const monthly = data?.granularidade === "MES";

	return (
		<ReportSection
			id="perdas"
			icon={Trash2}
			title="Perdas e descartes"
			description="Descartes e ajustes negativos valorizados ao custo unitário da movimentação."
		>
			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-56">
				{data ? (
					<div className="flex flex-wrap gap-4">
						<ReportCard className="min-w-0 flex-[2_1_460px]">
							<ReportCardHeader icon={CalendarRange} title={monthly ? "PERDAS POR MÊS" : "PERDAS POR SEMANA"}>
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-[0.65rem] font-medium">TOTAL NO PERÍODO</span>
									<span className="text-sm font-semibold tabular-nums">{formatMoney(data.total)}</span>
									{change != null && change !== 0 ? (
										<span
											className={cn(
												"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold",
												change < 0 ? "bg-green-200 text-green-700" : "bg-red-200 text-red-700",
											)}
											title="Comparado ao período anterior de mesma duração"
										>
											{change < 0 ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
											{formatFraction(Math.abs(change))}
										</span>
									) : null}
								</div>
							</ReportCardHeader>
							<div className="border-border flex h-[170px] items-end gap-1 border-b pt-4 sm:gap-3">
								{data.serie.map((bucket) => (
									<div key={bucket.inicio} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
										{bucket.valor > 0 && data.serie.length <= 14 ? (
											<span className="whitespace-nowrap text-[11px] font-semibold tabular-nums">{formatMoney(bucket.valor)}</span>
										) : null}
										<div
											className="bg-destructive/75 w-full max-w-16 rounded-t-lg"
											style={{ height: `${(bucket.valor / maxBucket) * 82}%` }}
											title={`${formatBucketLabel(bucket.inicio, bucket.fim, monthly)}: ${formatMoney(bucket.valor)}`}
										/>
									</div>
								))}
							</div>
							<div className="flex gap-1 sm:gap-3">
								{data.serie.map((bucket, index) => (
									<span key={bucket.inicio} className="text-muted-foreground min-w-0 flex-1 truncate text-center text-[11px]">
										{data.serie.length <= 14 || index % 2 === 0 ? formatBucketLabel(bucket.inicio, bucket.fim, monthly) : ""}
									</span>
								))}
							</div>
						</ReportCard>
						<ReportCard className="flex-[1_1_280px]">
							<ReportCardHeader icon={List} title="POR MOTIVO" />
							{data.porMotivo.length === 0 ? <span className="text-muted-foreground text-xs">Nenhuma perda registrada no período.</span> : null}
							{data.porMotivo.map((reason) => (
								<div key={reason.motivo} className="flex flex-col gap-1">
									<div className="flex justify-between gap-2 text-xs">
										<span className="font-medium">{reason.rotulo}</span>
										<b className="tabular-nums">{formatMoney(reason.valor)}</b>
									</div>
									<div className="bg-muted h-2 overflow-hidden rounded-full">
										<div className="bg-destructive/75 h-full rounded-full" style={{ width: `${(reason.valor / maxReason) * 100}%` }} />
									</div>
								</div>
							))}
							{data.produtos.length > 0 ? (
								<div className="border-border flex flex-col gap-1.5 border-t pt-2.5">
									<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">Produtos com mais perdas</span>
									{data.produtos.map((product) => (
										<div key={product.produtoId} className="flex justify-between gap-2 text-xs">
											<span className="truncate font-medium">{product.nome}</span>
											<span className="whitespace-nowrap">
												<span className="text-muted-foreground">{formatQuantity(product.quantidade)} un · </span>
												<b className="text-red-600 tabular-nums">{formatMoney(product.valor)}</b>
											</span>
										</div>
									))}
								</div>
							) : null}
						</ReportCard>
					</div>
				) : null}
			</ReportSectionState>
		</ReportSection>
	);
}

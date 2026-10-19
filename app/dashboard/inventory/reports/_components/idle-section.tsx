"use client";

import { useStockReportIdle } from "@/lib/queries/inventory-reports";
import { formatDate, formatFraction, formatMoney, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { Hourglass } from "lucide-react";
import { MetricLabel, ReportSection, ReportSectionState } from "./report-section";

/** Do âmbar claro ao escuro conforme o tempo parado. */
const BUCKET_COLORS = ["bg-[#e3b042]", "bg-[#c98a2c]", "bg-[#9a691e]"];

export function IdleSection() {
	const { data, isLoading, error } = useStockReportIdle({ limit: 6 });
	const maxBucket = Math.max(1, ...(data?.faixas.map((bucket) => bucket.valor) ?? []));

	return (
		<ReportSection id="parado" icon={Hourglass} title="Estoque parado" description="Produtos com saldo e sem nenhuma saída há mais de 30 dias.">
			<ReportSectionState
				isLoading={isLoading}
				error={error}
				isEmpty={!!data && data.produtos === 0}
				emptyMessage="Nenhum produto parado há mais de 30 dias."
			>
				{data ? (
					<div className="flex flex-wrap gap-4">
						<div className="flex flex-[1_1_260px] flex-col gap-2">
							<div className="bg-card border-border flex flex-col gap-1 rounded-xl border px-3.5 py-4 shadow-2xs">
								<span className="text-xs font-medium uppercase tracking-tight">Capital parado</span>
								<span className="text-info text-2xl font-bold tabular-nums">{formatMoney(data.capitalParado)}</span>
								<span className="text-muted-foreground text-xs">
									{formatQuantity(data.produtos)} {data.produtos === 1 ? "produto" : "produtos"} · {formatFraction(data.percentualImobilizado)} do valor
									imobilizado
								</span>
							</div>
							{data.faixas.map((bucket, index) => (
								<div key={bucket.faixa} className="flex flex-col gap-1 px-0.5 py-1">
									<div className="flex justify-between text-xs">
										<span className="font-semibold">{bucket.rotulo}</span>
										<span className="text-muted-foreground">
											{formatQuantity(bucket.produtos)} {bucket.produtos === 1 ? "produto" : "produtos"} ·{" "}
											<b className="text-foreground">{formatMoney(bucket.valor)}</b>
										</span>
									</div>
									<div className="bg-muted h-2 overflow-hidden rounded-full">
										<div className={cn("h-full rounded-full", BUCKET_COLORS[index])} style={{ width: `${(bucket.valor / maxBucket) * 100}%` }} />
									</div>
								</div>
							))}
						</div>
						<div className="flex min-w-0 flex-[2_1_460px] flex-col gap-2">
							{data.itens.map((item) => (
								<div key={item.produtoId} className="bg-card border-border flex flex-wrap items-center gap-4 rounded-xl border px-3 py-2.5 shadow-2xs">
									<div className="flex min-w-0 flex-[1_1_200px] flex-col">
										<span className="text-sm font-bold tracking-tight">{item.nome}</span>
										<span className="text-foreground/70 text-[0.65rem] font-medium">
											{item.codigo} · {item.ultimaSaida ? `última saída ${formatDate(item.ultimaSaida)}` : "sem saídas registradas"}
										</span>
									</div>
									<span
										className={cn(
											"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold",
											item.diasSemSaida > 90
												? "bg-destructive-surface text-destructive-surface-foreground"
												: "bg-warning-surface text-warning-surface-foreground",
										)}
									>
										<Hourglass className="size-3" />
										{item.diasSemSaida} dias
									</span>
									<div className="flex w-16 flex-col items-end gap-0.5">
										<MetricLabel>Saldo</MetricLabel>
										<span className="text-xs font-semibold tabular-nums">
											{formatQuantity(item.saldo)} {item.unidade.toLowerCase()}
										</span>
									</div>
									<div className="flex w-[90px] flex-col items-end gap-0.5">
										<MetricLabel>Valor parado</MetricLabel>
										<span className="text-sm font-bold tabular-nums">{formatMoney(item.valor)}</span>
									</div>
								</div>
							))}
						</div>
					</div>
				) : null}
			</ReportSectionState>
		</ReportSection>
	);
}

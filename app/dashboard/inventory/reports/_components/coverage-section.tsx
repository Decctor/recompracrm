"use client";

import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/navigation/routes";
import { type TStockReportPeriod, useStockReportCoverage } from "@/lib/queries/inventory-reports";
import { formatDays, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ABC_CLASS_STYLES } from "./abc-section";
import { ReportSection, ReportSectionState } from "./report-section";

const PAGE_SIZE = 10;
/** A barra de cobertura enche em 60 dias; acima disso, "60+ dias". */
const COVERAGE_BAR_DAYS = 60;
/** Cobertura acima disto é excesso (cinza), não saúde. */
const OVERSTOCK_DAYS = 45;
const GRID = "grid grid-cols-[minmax(220px,2.2fr)_56px_1fr_1fr_2fr_0.8fr] gap-3";

/**
 * Tom da cobertura em relação ao prazo de reposição: acaba antes de a compra chegar (vermelho),
 * em até dois prazos (âmbar), saudável (verde) ou excesso (cinza).
 */
export function coverageTone(coverageDays: number | null, leadTimeDays: number) {
	if (coverageDays == null) return { text: "text-muted-foreground", bar: "bg-ring" };
	if (coverageDays <= leadTimeDays) return { text: "text-red-600", bar: "bg-red-600" };
	if (coverageDays <= leadTimeDays * 2) return { text: "text-yellow-700 dark:text-yellow-500", bar: "bg-yellow-700 dark:bg-yellow-500" };
	if (coverageDays > OVERSTOCK_DAYS) return { text: "text-muted-foreground", bar: "bg-ring" };
	return { text: "text-success", bar: "bg-success" };
}

export function CoverageSection({ period }: { period: TStockReportPeriod }) {
	const [limit, setLimit] = useState(PAGE_SIZE);
	const { data, isLoading, error, isFetching } = useStockReportCoverage({ period, limit });

	return (
		<ReportSection
			id="giro"
			icon={RefreshCw}
			title="Giro e cobertura"
			description="Cobertura = saldo ÷ consumo médio diário. Ordenado do menor para o maior: quem acaba primeiro aparece em cima."
		>
			<ReportSectionState
				isLoading={isLoading}
				error={error}
				isEmpty={!!data && data.itens.length === 0}
				emptyMessage="Nenhum produto com saldo ou consumo."
			>
				{data ? (
					<div className="bg-card border-border overflow-auto rounded-xl border shadow-2xs">
						<div className="min-w-[760px]">
							<div className={cn(GRID, "border-border text-muted-foreground border-b px-3.5 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wide")}>
								<span>Produto</span>
								<span>Classe</span>
								<span className="text-right">Consumo / dia</span>
								<span className="text-right">Saldo</span>
								<span>Cobertura</span>
								<span className="text-right">Giro</span>
							</div>
							{data.itens.map((item) => {
								const tone = coverageTone(item.coberturaDias, item.prazoReposicaoDias);
								const barWidth = item.coberturaDias == null ? 0 : Math.min(100, (item.coberturaDias / COVERAGE_BAR_DAYS) * 100);
								return (
									<Link
										key={item.produtoId}
										href={appRoutes.catalog.product(item.produtoId)}
										className={cn(GRID, "border-border hover:bg-muted/50 items-center border-b px-3.5 py-2.5 last:border-b-0")}
									>
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-bold tracking-tight">{item.nome}</span>
											<span className="text-foreground/70 text-[0.65rem] font-medium">
												{item.codigo} · {item.grupo}
											</span>
										</div>
										<span className={cn("flex size-6 items-center justify-center rounded-lg text-xs font-extrabold", ABC_CLASS_STYLES[item.classe].badge)}>
											{item.classe}
										</span>
										<span className="text-right text-sm font-semibold tabular-nums">
											{formatQuantity(item.consumoMedioDia, 1)} {item.unidade.toLowerCase()}
										</span>
										<span className="text-right text-sm font-semibold tabular-nums">
											{formatQuantity(item.saldo)} {item.unidade.toLowerCase()}
										</span>
										<div className="flex items-center gap-2">
											<div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
												<div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${barWidth}%` }} />
											</div>
											<span className={cn("w-[72px] text-right text-xs font-bold tabular-nums", tone.text)}>
												{formatDays(item.coberturaDias, { cap: COVERAGE_BAR_DAYS })}
											</span>
										</div>
										<span className="text-right text-sm font-semibold tabular-nums">{item.giro != null ? `${formatQuantity(item.giro, 1)}×` : "—"}</span>
									</Link>
								);
							})}
						</div>
					</div>
				) : null}
				{data && data.total > data.itens.length ? (
					<Button variant="ghost" size="sm" className="self-center" disabled={isFetching} onClick={() => setLimit((current) => current + PAGE_SIZE * 2)}>
						VER MAIS ({data.total - data.itens.length} restantes)
					</Button>
				) : null}
			</ReportSectionState>
		</ReportSection>
	);
}

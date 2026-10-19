"use client";

import { useStockReportExpirations } from "@/lib/queries/inventory-reports";
import { formatMoney, formatQuantity } from "@/lib/stock/analytics/format";
import { cn } from "@/lib/utils";
import { CalendarClock, CheckCheck, TriangleAlert } from "lucide-react";
import { ReportSection, ReportSectionState } from "./report-section";

const BUCKET_STYLES = {
	VENCIDOS: "bg-destructive-surface border-destructive/25 text-destructive-surface-foreground",
	ATE_7: "bg-warning-surface border-warning/40 text-warning-surface-foreground",
	DE_8_A_30: "bg-info-surface border-info/20 text-info-surface-foreground",
	DE_31_A_60: "bg-card border-border text-foreground",
} as const;

/** Validade gravada à meia-noite UTC: formatada em UTC para não cair no dia anterior. */
function formatValidity(epoch: number) {
	const date = new Date(epoch);
	return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export function ExpirationsSection() {
	const { data, isLoading, error } = useStockReportExpirations({ limit: 12 });
	return (
		<ReportSection
			id="vencimentos"
			icon={CalendarClock}
			title="Vencimentos de lotes"
			description="Lotes ativos por prazo até a validade, com o valor em risco ao custo do lote."
		>
			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-40">
				{data ? (
					<>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
							{data.faixas.map((bucket) => (
								<div key={bucket.faixa} className={cn("flex flex-col gap-1 rounded-xl border px-3.5 py-3", BUCKET_STYLES[bucket.faixa])}>
									<span className="text-xs font-bold uppercase tracking-wide">{bucket.rotulo}</span>
									<span className="text-[22px] font-bold tabular-nums">
										{formatQuantity(bucket.lotes)} {bucket.lotes === 1 ? "lote" : "lotes"}
									</span>
									<span className="text-xs font-medium">{formatMoney(bucket.valor)} em risco</span>
								</div>
							))}
						</div>
						{data.lotes.length === 0 ? (
							<div className="border-border text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">
								Nenhum lote vencido ou vencendo nos próximos 30 dias.
							</div>
						) : (
							<div className="flex flex-col gap-2">
								{data.lotes.map((lot) => {
									const expired = lot.diasAteValidade <= 0;
									return (
										<div
											key={lot.id}
											className="bg-card border-border flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 shadow-2xs"
										>
											<div className="flex flex-wrap items-center gap-2">
												{expired ? <TriangleAlert className="text-destructive size-4" /> : <CheckCheck className="text-success size-4" />}
												<span className="text-sm font-bold tracking-tight">{lot.codigoLote ?? "Lote sem código"}</span>
												<span className="text-muted-foreground text-xs font-medium tabular-nums">
													{formatQuantity(lot.quantidadeAtual)}/{formatQuantity(lot.quantidadeInicial)}
												</span>
												<span className="text-xs font-medium">{lot.varianteNome ? `${lot.produtoNome} · ${lot.varianteNome}` : lot.produtoNome}</span>
											</div>
											<div className="flex items-center gap-3">
												<span className="text-xs font-semibold tabular-nums">{formatMoney(lot.valor)}</span>
												<div
													className={cn(
														"inline-flex items-center gap-1 text-xs font-medium",
														expired ? "text-destructive" : lot.diasAteValidade <= 7 ? "text-yellow-700 dark:text-yellow-500" : "text-muted-foreground",
													)}
												>
													<CalendarClock className="size-3.5" />
													{expired ? `Vencido · ${formatValidity(lot.dataValidade)}` : `Vence ${formatValidity(lot.dataValidade)}`}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</>
				) : null}
			</ReportSectionState>
		</ReportSection>
	);
}

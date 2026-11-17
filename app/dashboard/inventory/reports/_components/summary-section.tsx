"use client";

import StatUnitCard from "@/components/Stats/StatUnitCard";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { type TStockReportPeriod, useStockReportSummary } from "@/lib/queries/inventory-reports";
import { cn } from "@/lib/utils";
import { AlertTriangle, BadgeDollarSign, Boxes, CalendarClock } from "lucide-react";
import { ReportSection, ReportSectionState } from "./report-section";
import { StockValueChart } from "./stock-value-chart";

export function SummarySection({ period, periodLabel, canViewCosts }: { period: TStockReportPeriod; periodLabel: string; canViewCosts: boolean }) {
	const { data, isLoading, error } = useStockReportSummary({ period });
	const previousLabel = `HÁ ${periodLabel.toUpperCase()}`;
	const units = (n: number) => `${formatDecimalPlaces(n, 0, 0)} un`;
	const count = (n: number) => formatDecimalPlaces(n, 0, 0);

	return (
		<ReportSection
			id="resumo"
			icon={Boxes}
			title="Resumo"
			description={canViewCosts ? "Retrato do estoque hoje e a evolução do capital imobilizado no período." : "Retrato do estoque hoje."}
		>
			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-28">
				{data ? (
					<div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", data.valorImobilizado ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
						<StatUnitCard
							title="Em estoque"
							subtitle={`${count(data.produtosComSaldo)} produtos com saldo`}
							icon={<Boxes className="size-4 min-h-4 min-w-4" />}
							current={{ value: data.emEstoque.atual, format: units }}
							previous={{ value: data.emEstoque.anterior, format: units }}
							previousLabel={previousLabel}
						/>
						{/* Ao custo: o servidor manda `null` para quem não vê custos. */}
						{data.valorImobilizado ? (
							<StatUnitCard
								title="Valor imobilizado"
								subtitle="Saldo × custo unitário"
								icon={<BadgeDollarSign className="size-4 min-h-4 min-w-4" />}
								current={{ value: data.valorImobilizado.atual, format: formatToMoney }}
								previous={{ value: data.valorImobilizado.anterior, format: formatToMoney }}
								previousLabel={previousLabel}
								lowerIsBetter
							/>
						) : null}
						<StatUnitCard
							title="Sem estoque"
							subtitle="Produtos zerados"
							icon={<AlertTriangle className="size-4 min-h-4 min-w-4" />}
							current={{ value: data.semEstoque.atual, format: count }}
							previous={{ value: data.semEstoque.anterior, format: count }}
							previousLabel={previousLabel}
							lowerIsBetter
						/>
						<StatUnitCard
							title="Lotes vencendo"
							subtitle="Ativos com validade em 7 dias"
							icon={<CalendarClock className="size-4 min-h-4 min-w-4" />}
							current={{ value: data.lotesVencendo7Dias.atual, format: count }}
							// O saldo dos lotes não tem histórico: a comparação existe, mas não tem valor a afirmar.
							// Mesmo valor do atual zera a variação (sem badge) e a linha imprime "—".
							previous={
								data.lotesVencendo7Dias.anterior == null
									? { value: data.lotesVencendo7Dias.atual, format: () => "—" }
									: { value: data.lotesVencendo7Dias.anterior, format: count }
							}
							previousLabel={previousLabel}
							lowerIsBetter
						/>
					</div>
				) : null}
			</ReportSectionState>
			{canViewCosts ? <StockValueChart period={period} /> : null}
		</ReportSection>
	);
}

"use client";

import StatUnitCard from "@/components/Stats/StatUnitCard";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { type TStockReportPeriod, useStockReportSummary } from "@/lib/queries/inventory-reports";
import { AlertTriangle, BadgeDollarSign, Boxes, CalendarClock } from "lucide-react";
import { ReportSection, ReportSectionState } from "./report-section";
import { StockValueChart } from "./stock-value-chart";

export function SummarySection({ period, periodLabel }: { period: TStockReportPeriod; periodLabel: string }) {
	const { data, isLoading, error } = useStockReportSummary({ period });
	const previousLabel = `HÁ ${periodLabel.toUpperCase()}`;
	const units = (n: number) => `${formatDecimalPlaces(n, 0, 0)} un`;
	const count = (n: number) => formatDecimalPlaces(n, 0, 0);

	return (
		<ReportSection id="resumo" icon={Boxes} title="Resumo" description="Retrato do estoque hoje e a evolução do capital imobilizado no período.">
			<ReportSectionState isLoading={isLoading} error={error} skeletonClassName="h-28">
				{data ? (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<StatUnitCard
							title="Em estoque"
							subtitle={`${count(data.produtosComSaldo)} produtos com saldo`}
							icon={<Boxes className="size-4 min-h-4 min-w-4" />}
							current={{ value: data.emEstoque.atual, format: units }}
							previous={{ value: data.emEstoque.anterior, format: units }}
							previousLabel={previousLabel}
						/>
						<StatUnitCard
							title="Valor imobilizado"
							subtitle="Saldo × custo unitário"
							icon={<BadgeDollarSign className="size-4 min-h-4 min-w-4" />}
							current={{ value: data.valorImobilizado.atual, format: formatToMoney }}
							previous={{ value: data.valorImobilizado.anterior, format: formatToMoney }}
							previousLabel={previousLabel}
							lowerIsBetter
						/>
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
			<StockValueChart period={period} />
		</ReportSection>
	);
}

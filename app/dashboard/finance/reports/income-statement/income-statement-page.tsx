"use client";

import { useState } from "react";
import { FileSpreadsheet, Layers2, TrendingUp } from "lucide-react";
import { ReportCard, ReportCardHeader, ReportSectionState } from "@/app/dashboard/inventory/reports/_components/report-section";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import SegmentedControl from "@/components/Utils/SegmentedControl";
import { formatToMoney } from "@/lib/formatting";
import { useFinancesDre } from "@/lib/queries/finance-analytics";
import { buildCompositionGroups, DreCompositionTreemap, type TCompositionMode } from "./_components/dre-composition-treemap";
import { DreMarginsChart, DreMarginsLegend } from "./_components/dre-margins-chart";
import { DreStatement } from "./_components/dre-statement";

const COMPOSITION_MODES: { value: TCompositionMode; label: string }[] = [
	{ value: "all", label: "Custos e despesas" },
	{ value: "expenses", label: "Só despesas" },
];

export default function IncomeStatementPage() {
	const [compositionMode, setCompositionMode] = useState<TCompositionMode>("all");
	const { data: dre, isLoading, error, params, updateParams } = useFinancesDre({ initialParams: {} });

	const demonstrativo = dre?.demonstrativo;
	const serie = dre?.serie ?? [];
	const compositionGroups = demonstrativo ? buildCompositionGroups(demonstrativo, compositionMode) : [];
	const compositionTotal = compositionGroups.reduce((sum, group) => sum + group.total, 0);
	const hasStatement =
		!!demonstrativo &&
		[demonstrativo.receita, demonstrativo.custos, demonstrativo.despesas].some((category) => category.total !== 0 || category.totalAnterior !== 0);

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
				<h1 className="text-xs font-bold uppercase tracking-tight">DRE gerencial (competência)</h1>
				<div className="w-fit">
					<DateIntervalInput
						label="PERÍODO"
						labelClassName="hidden"
						className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
						value={{ after: params.periodAfter, before: params.periodBefore }}
						handleChange={(value) => updateParams({ periodAfter: value.after ?? params.periodAfter, periodBefore: value.before ?? params.periodBefore })}
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-start gap-4">
				<ReportCard className="min-w-0 flex-[1_1_520px] gap-2">
					<div className="px-1 pb-1">
						<ReportCardHeader icon={FileSpreadsheet} title="DEMONSTRATIVO DO PERÍODO" />
					</div>
					<ReportSectionState
						isLoading={isLoading}
						error={error}
						isEmpty={!hasStatement}
						emptyMessage="Nenhum lançamento de receita, custo ou despesa no período."
						skeletonClassName="h-80"
					>
						{demonstrativo ? <DreStatement demonstrativo={demonstrativo} /> : null}
					</ReportSectionState>
				</ReportCard>

				<ReportCard className="min-w-0 flex-[1_1_440px] gap-4 px-4">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex flex-col gap-1.5">
							<ReportCardHeader icon={TrendingUp} title="MARGENS · 12 MESES" />
							<span className="text-muted-foreground text-xs">Barras: receita bruta do mês</span>
						</div>
						<DreMarginsLegend />
					</div>
					<ReportSectionState
						isLoading={isLoading}
						error={error}
						isEmpty={serie.every((month) => month.receita === 0)}
						emptyMessage="Sem receita nos últimos 12 meses para calcular margens."
						skeletonClassName="h-72"
					>
						<DreMarginsChart serie={serie} />
					</ReportSectionState>
				</ReportCard>
			</div>

			<ReportCard className="gap-3.5 px-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex flex-col gap-1.5">
						<ReportCardHeader icon={Layers2} title="COMPOSIÇÃO DE CUSTOS E DESPESAS" />
						<span className="text-muted-foreground text-xs">
							Área proporcional ao valor no período · {formatToMoney(compositionTotal)} por plano de contas
						</span>
					</div>
					<SegmentedControl aria-label="Composição" value={compositionMode} options={COMPOSITION_MODES} onChange={setCompositionMode} />
				</div>
				<ReportSectionState
					isLoading={isLoading}
					error={error}
					isEmpty={compositionGroups.length === 0}
					emptyMessage={compositionMode === "all" ? "Nenhum custo ou despesa no período." : "Nenhuma despesa no período."}
					skeletonClassName="h-[360px]"
				>
					<DreCompositionTreemap groups={compositionGroups} />
				</ReportSectionState>
			</ReportCard>
		</div>
	);
}

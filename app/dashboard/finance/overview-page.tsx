"use client";

import dayjs from "dayjs";
import { ArrowRightLeft, BadgeDollarSign, CalendarClock, Layers2, Package, ReceiptText, Wallet } from "lucide-react";
import { ReportSection, ReportSectionState } from "@/app/dashboard/inventory/reports/_components/report-section";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { formatToMoney } from "@/lib/formatting";
import { useFinancesDre } from "@/lib/queries/finance-analytics";
import { useFinancesOverallStats } from "@/lib/queries/finances";
import { KpiSparkline } from "./_components/finance-chart-kit";
import { DailyCashFlow } from "./_components/overview/daily-cash-flow";
import { PendingSummary, TopOutflowAccounts } from "./_components/overview/pending-and-top-outflows";
import { ResultWaterfall } from "./_components/overview/result-waterfall";

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "Outubro de 2026" para um mês cheio; "01/10/2026 – 15/10/2026" para qualquer outro recorte. */
function describePeriod(after: Date, before: Date) {
	const start = dayjs(after);
	const end = dayjs(before);
	const isFullMonth = start.isSame(start.startOf("month"), "day") && end.isSame(start.endOf("month"), "day");
	if (isFullMonth) return `${MONTH_NAMES[start.month()]} de ${start.year()}`;
	return `${start.format("DD/MM/YYYY")} – ${end.format("DD/MM/YYYY")}`;
}

const money = (value: number) => formatToMoney(value);

export default function FinanceOverviewPage() {
	const statsQuery = useFinancesOverallStats({ initialParams: {} });
	const { params } = statsQuery;
	const dreQuery = useFinancesDre({ initialParams: { periodAfter: params.periodAfter, periodBefore: params.periodBefore } });
	const stats = statsQuery.data;
	const dre = dreQuery.data;

	function handlePeriodChange(value: { after?: Date; before?: Date }) {
		const next = { periodAfter: value.after ?? params.periodAfter, periodBefore: value.before ?? params.periodBefore };
		statsQuery.updateParams(next);
		dreQuery.updateParams(next);
	}

	const previousPeriodLabel = dre ? `${dayjs(dre.periodoAnterior.inicio).format("DD/MM")} – ${dayjs(dre.periodoAnterior.fim).format("DD/MM")}` : null;
	const cashNet = stats ? stats.totalInFlow - stats.totalOutFlow : 0;
	const previousCashNet = stats ? stats.previous.totalInFlow - stats.previous.totalOutFlow : 0;

	return (
		<div className="flex w-full flex-col gap-8">
			<ReportSection
				id="resumo"
				icon={Wallet}
				title="Resumo"
				description={`${describePeriod(params.periodAfter, params.periodBefore)}, comparado ao período anterior de mesma duração${previousPeriodLabel ? ` (${previousPeriodLabel})` : ""}.`}
				actions={
					<DateIntervalInput
						label="PERÍODO"
						labelClassName="hidden"
						className="border-border bg-card hover:bg-muted rounded-full shadow-none"
						value={{ after: params.periodAfter, before: params.periodBefore }}
						handleChange={handlePeriodChange}
					/>
				}
			>
				<ReportSectionState isLoading={statsQuery.isLoading || dreQuery.isLoading} error={statsQuery.error ?? dreQuery.error} skeletonClassName="h-40">
					{stats && dre ? (
						<div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
							<StatUnitCard
								title="Receitas"
								subtitle="Receita bruta por competência"
								icon={<BadgeDollarSign className="size-4" />}
								current={{ value: dre.demonstrativo.receita.total, format: money }}
								previous={{ value: dre.demonstrativo.receita.totalAnterior, format: money }}
								previousLabel="NO PERÍODO ANTERIOR"
								footer={<KpiSparkline values={dre.serie.map((month) => month.receita)} label="12M" />}
							/>
							<StatUnitCard
								title="Custos"
								subtitle="Custos por competência"
								icon={<Package className="size-4" />}
								current={{ value: dre.demonstrativo.custos.total, format: money }}
								previous={{ value: dre.demonstrativo.custos.totalAnterior, format: money }}
								previousLabel="NO PERÍODO ANTERIOR"
								lowerIsBetter
								footer={<KpiSparkline values={dre.serie.map((month) => month.custo)} label="12M" />}
							/>
							<StatUnitCard
								title="Despesas"
								subtitle="Despesas operacionais"
								icon={<ReceiptText className="size-4" />}
								current={{ value: dre.demonstrativo.despesas.total, format: money }}
								previous={{ value: dre.demonstrativo.despesas.totalAnterior, format: money }}
								previousLabel="NO PERÍODO ANTERIOR"
								lowerIsBetter
								footer={<KpiSparkline values={dre.serie.map((month) => month.despesa)} label="12M" />}
							/>
							<StatUnitCard
								title="Caixa líquido"
								subtitle="Recebido − pago no período"
								icon={<ArrowRightLeft className="size-4" />}
								current={{ value: cashNet, format: money }}
								previous={{ value: previousCashNet, format: money }}
								previousLabel="NO PERÍODO ANTERIOR"
								footer={<KpiSparkline values={stats.monthlyCashFlow.map((month) => month.liquido)} label="12M" />}
							/>
						</div>
					) : null}
				</ReportSectionState>
			</ReportSection>

			<ReportSection id="resultado" icon={Layers2} title="Resultado" description="Do faturamento ao resultado operacional, por competência.">
				<ReportSectionState isLoading={dreQuery.isLoading} error={dreQuery.error} skeletonClassName="h-80">
					{dre ? <ResultWaterfall demonstrativo={dre.demonstrativo} /> : null}
				</ReportSectionState>
			</ReportSection>

			<ReportSection
				id="caixa-e-pendencias"
				icon={CalendarClock}
				title="Caixa e pendências"
				description="Fluxo diário efetivado até hoje e previsto até o fim do período, e o que está em aberto."
			>
				<div className="flex flex-wrap items-start gap-4">
					<ReportSectionState isLoading={statsQuery.isLoading} error={statsQuery.error} skeletonClassName="h-[380px] flex-[2_1_560px]">
						{stats ? <DailyCashFlow stats={stats} periodAfter={params.periodAfter} /> : null}
					</ReportSectionState>
					<div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
						<ReportSectionState isLoading={statsQuery.isLoading} error={statsQuery.error} skeletonClassName="h-56">
							{stats ? <PendingSummary stats={stats} /> : null}
						</ReportSectionState>
						<ReportSectionState isLoading={dreQuery.isLoading} error={dreQuery.error} skeletonClassName="h-64">
							{dre ? <TopOutflowAccounts demonstrativo={dre.demonstrativo} /> : null}
						</ReportSectionState>
					</div>
				</div>
			</ReportSection>
		</div>
	);
}

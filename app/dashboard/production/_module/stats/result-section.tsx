"use client";

import type { TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { FunnelStrip, ResultHeadline, SplitFigure, StripBadge } from "@/app/dashboard/growth/campaigns/_module/shared/stats/result-panel";
import { Section } from "@/components/ui/section";
import { formatCampaignStatsPeriodLabel, formatCampaignStatsPeriodRange, type TStatsPeriod } from "@/lib/campaigns/stats-period";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { BadgeDollarSign, CheckCheck, Coins, Gauge, RefreshCcw, Scale, Sparkles } from "lucide-react";
import { ProductionTrendChart } from "./production-trend-chart";
import { formatRatioPercent, formatUnitLabel, formatUnitQuantity, quantityInUnit } from "./stats-format";

type TStatsData = TGetProductionStatsOutput["data"];

/** A margem como fatia do valor produzido: âmbar até onde vai a margem, cinza no custo. */
function MarginSplitBar({ margin, total }: { margin: number; total: number }) {
	const share = total > 0 ? Math.min(Math.max(margin / total, 0), 1) : 0;
	return (
		<div className="flex h-2 w-full gap-1" role="img" aria-label={`${formatDecimalPlaces(share * 100)}% de margem`}>
			{share > 0 ? <div className="h-full rounded-full bg-[#FFB900]" style={{ width: `${share * 100}%` }} /> : null}
			{share < 1 ? <div className="h-full flex-1 rounded-full bg-muted" /> : null}
		</div>
	);
}

type ResultSectionProps = {
	stats: TStatsData;
	period: TStatsPeriod;
	comparingPeriod: TStatsPeriod;
	/** Sem `dadosSensiveis.visualizarCustos` a API manda custo e margem `null`: os blocos somem. */
	canViewCosts: boolean;
};

export function ResultSection({ stats, period, comparingPeriod, canViewCosts }: ResultSectionProps) {
	const current = stats.summary.current;
	const comparison = stats.summary.comparison;
	const mainUnit = current.unidadePrincipal;
	const hasComparison = comparison.completedCount > 0;

	const comparingLabel = formatCampaignStatsPeriodLabel(comparingPeriod);
	const previousPrefix = /^\d/.test(comparingLabel) ? "No período anterior" : "No mês anterior";
	const previousText = (formatted: string) => (hasComparison ? `${previousPrefix}: ${formatted}` : "Sem dados no período anterior");
	const formatMainUnit = (value: number) => (mainUnit ? formatUnitQuantity(value, mainUnit) : "—");

	const costShare = current.custoProducao != null && current.valorProduzido > 0 ? (current.custoProducao / current.valorProduzido) * 100 : null;
	const costPerUnit =
		current.custoPorUnidadePrincipal != null && mainUnit ? `${formatToMoney(current.custoPorUnidadePrincipal)}/${formatUnitLabel(mainUnit)}` : "—";

	const otherVolumes = current.volumes.filter((item) => item.unidade !== mainUnit);
	const mainLoss = quantityInUnit(current.perdas, mainUnit);
	const mainLeftover = quantityInUnit(current.saldoReincorporado, mainUnit);
	const runningAndCancelled = [
		current.inProgressCount > 0 ? `${formatDecimalPlaces(current.inProgressCount)} em andamento` : null,
		current.cancelledCount > 0 ? `${formatDecimalPlaces(current.cancelledCount)} ${current.cancelledCount === 1 ? "cancelada" : "canceladas"}` : null,
	].filter(Boolean);

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<BadgeDollarSign />
				</Section.Icon>
				<Section.Title>Resultado do período</Section.Title>
				<Section.Actions>
					<span className="text-[0.7rem] font-medium text-muted-foreground">Comparado com {formatCampaignStatsPeriodRange(comparingPeriod)}</span>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
					<div className="flex min-w-0 flex-col gap-5 lg:border-r lg:border-border lg:pr-6">
						<ResultHeadline
							label="Valor produzido"
							value={current.valorProduzido}
							previous={hasComparison ? comparison.valorProduzido : null}
							previousText={previousText(formatToMoney(comparison.valorProduzido))}
						/>
						{canViewCosts && current.margem != null && current.custoProducao != null ? (
							<>
						<MarginSplitBar margin={current.margem} total={current.valorProduzido} />
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<SplitFigure
								icon={Sparkles}
								iconClassName="text-[#E0A100]"
								label="Margem estimada"
								value={formatToMoney(current.margem)}
								hint={
									current.margemPercentual != null ? `${formatDecimalPlaces(current.margemPercentual, 1, 1)}% do valor produzido` : "— do valor produzido"
								}
							/>
							<SplitFigure
								icon={Coins}
								label="Custo de produção"
								value={formatToMoney(current.custoProducao)}
								hint={`${costShare != null ? `${formatDecimalPlaces(costShare, 1, 1)}%` : "—"} do valor · ${costPerUnit}`}
							/>
						</div>
							</>
						) : null}
					</div>
					<ProductionTrendChart
						series={stats.series}
						period={period}
						comparingPeriod={comparingPeriod}
						currentLabel={formatCampaignStatsPeriodLabel(period)}
						comparingLabel={comparingLabel}
						mainUnit={mainUnit}
					/>
				</div>
			</Section.Body>
			<Section.Bleed>
				<FunnelStrip
					cells={[
						{
							key: "completed",
							title: "Produções concluídas",
							icon: CheckCheck,
							value: formatDecimalPlaces(current.completedCount),
							badge: runningAndCancelled.length > 0 ? <StripBadge>{runningAndCancelled.join(" · ")}</StripBadge> : undefined,
							hint: previousText(formatDecimalPlaces(comparison.completedCount)),
						},
						{
							key: "volume",
							title: "Volume produzido",
							icon: Scale,
							value: formatMainUnit(current.volumePrincipal),
							badge:
								otherVolumes.length > 0 ? (
									<span className="text-xs font-semibold text-muted-foreground tabular-nums">
										{otherVolumes.map((item) => `+ ${formatUnitQuantity(item.quantidade, item.unidade)}`).join(" · ")}
									</span>
								) : undefined,
							hint: previousText(formatMainUnit(quantityInUnit(comparison.volumes, mainUnit))),
						},
						{
							key: "yield",
							title: "Rendimento real",
							icon: Gauge,
							value: formatRatioPercent(current.rendimento),
							badge: mainLoss > 0 && mainUnit ? <StripBadge>−{formatUnitQuantity(mainLoss, mainUnit)}</StripBadge> : undefined,
							hint: previousText(formatRatioPercent(comparison.rendimento)),
						},
						{
							key: "leftover",
							title: "Saldo reincorporado",
							icon: RefreshCcw,
							value: formatMainUnit(mainLeftover),
							badge:
								current.volumePrincipal > 0 && mainLeftover > 0 ? (
									<StripBadge>{formatDecimalPlaces((mainLeftover / current.volumePrincipal) * 100, 1, 1)}% do volume</StripBadge>
								) : undefined,
							hint: previousText(formatMainUnit(quantityInUnit(comparison.saldoReincorporado, mainUnit))),
						},
					]}
				/>
			</Section.Bleed>
		</Section.Root>
	);
}

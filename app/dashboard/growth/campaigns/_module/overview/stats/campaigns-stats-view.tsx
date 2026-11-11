"use client";

import { CampaignsTrendChart } from "@/app/dashboard/growth/campaigns/_module/shared/stats/campaigns-trend-chart";
import CampaignsBySegmentation from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsBySegmentation";
import CampaignsFunnel from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsFunnel";
import CampaignsRanking from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsRanking";
import { CampaignStatsConversionsBlock } from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignStatsConversionsBlock";
import { CampaignTriggerDistributionBlock } from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignTriggerDistributionBlock";
import { ConversionQualityBand } from "@/app/dashboard/growth/campaigns/_module/shared/stats/conversion-quality-band";
import {
	FunnelStrip,
	ResultHeadline,
	RevenueSplitBar,
	SplitFigure,
	StripBadge,
} from "@/app/dashboard/growth/campaigns/_module/shared/stats/result-panel";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import { Section } from "@/components/ui/section";
import {
	CAMPAIGN_STATS_PERIOD_PRESETS,
	formatCampaignStatsPeriodLabel,
	formatCampaignStatsPeriodRange,
	matchCampaignStatsPeriodPreset,
	resolveCampaignStatsComparisonPeriod,
	type TStatsPeriod,
} from "@/lib/campaigns/stats-period";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignStatsOverall, useConversionQuality } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, Grid3x3, MessageCircle, MousePointerClick, Sparkles } from "lucide-react";
import { useState } from "react";

function percentage(part: number, total: number) {
	return total > 0 ? (part / total) * 100 : 0;
}

export function CampaignsStatsView() {
	const [period, setPeriod] = useState<TStatsPeriod>(() => CAMPAIGN_STATS_PERIOD_PRESETS[0].getValue(new Date()));
	const comparingPeriod = resolveCampaignStatsComparisonPeriod(period);
	const activePreset = matchCampaignStatsPeriodPreset(period);

	const { data: analytics, isLoading: analyticsLoading } = useCampaignStatsOverall(period);
	const { data: previousAnalytics } = useCampaignStatsOverall(comparingPeriod);
	const { data: qualityData, isLoading: qualityLoading } = useConversionQuality(period);

	const totals = analytics?.totais;
	const previousTotals = previousAnalytics?.totais;
	const receita = totals?.receita ?? 0;
	const receitaIncremental = totals?.receitaIncremental ?? 0;
	const conversoes = totals?.conversoes ?? 0;
	const conversoesIncrementais = totals?.conversoesIncrementais ?? 0;
	const comparingLabel = formatCampaignStatsPeriodLabel(comparingPeriod);
	const previousPrefix = /^\d/.test(comparingLabel) ? "No período anterior" : "No mês anterior";

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-full flex-wrap items-center justify-end gap-2">
				<div className="flex items-center gap-1 rounded-lg bg-secondary p-1" role="group" aria-label="Atalhos de período">
					{CAMPAIGN_STATS_PERIOD_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							aria-pressed={activePreset === preset.id}
							onClick={() => setPeriod(preset.getValue(new Date()))}
							className={cn(
								"rounded-md px-2.5 py-1 text-[0.7rem] font-bold transition-colors",
								activePreset === preset.id ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{preset.label}
						</button>
					))}
				</div>
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="border-none shadow-none hover:bg-accent hover:text-accent-foreground"
					value={{ after: period.startDate, before: period.endDate }}
					handleChange={(value) => {
						if (!value.after || !value.before) return;
						setPeriod({ startDate: new Date(value.after), endDate: new Date(value.before) });
					}}
				/>
			</div>

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
						<div className="flex flex-col gap-5 lg:border-r lg:border-border lg:pr-6">
							<ResultHeadline
								label="Receita gerada"
								value={receita}
								previous={previousTotals?.receita}
								previousText={previousTotals ? `${previousPrefix}: ${formatToMoney(previousTotals.receita)}` : undefined}
							/>
							<RevenueSplitBar part={receitaIncremental} total={receita} />
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<SplitFigure
									icon={Sparkles}
									iconClassName="text-[#E0A100]"
									label="Receita incremental"
									value={formatToMoney(receitaIncremental)}
									hint={`${formatDecimalPlaces(percentage(receitaIncremental, receita))}% da receita · ${formatDecimalPlaces(conversoesIncrementais)} conversões`}
								/>
								<SplitFigure
									icon={MousePointerClick}
									label="Demais conversões"
									value={formatToMoney(Math.max(receita - receitaIncremental, 0))}
									hint={`${formatDecimalPlaces(percentage(receita - receitaIncremental, receita))}% da receita · ${formatDecimalPlaces(Math.max(conversoes - conversoesIncrementais, 0))} conversões`}
								/>
							</div>
						</div>
						<CampaignsTrendChart
							startDate={period.startDate}
							endDate={period.endDate}
							comparingStartDate={comparingPeriod.startDate}
							comparingEndDate={comparingPeriod.endDate}
							currentLabel={formatCampaignStatsPeriodLabel(period)}
							comparingLabel={comparingLabel}
						/>
					</div>
				</Section.Body>
				<Section.Bleed>
					<FunnelStrip
						cells={[
							{
								key: "active",
								title: "Campanhas ativas",
								icon: Grid3x3,
								value: analyticsLoading ? "…" : formatDecimalPlaces(totals?.campanhasAtivas ?? 0),
								hint: `${formatDecimalPlaces(totals?.campanhas ?? 0)} no total`,
							},
							{
								key: "interactions",
								title: "Interações",
								icon: MessageCircle,
								value: formatDecimalPlaces(totals?.interacoes ?? 0),
								hint: previousTotals ? `${previousPrefix}: ${formatDecimalPlaces(previousTotals.interacoes)}` : undefined,
							},
							{
								key: "conversions",
								title: "Conversões",
								icon: MousePointerClick,
								value: formatDecimalPlaces(conversoes),
								badge: <StripBadge>{formatDecimalPlaces(totals?.taxaConversaoGeral ?? 0)}% taxa</StripBadge>,
								hint: previousTotals ? `${previousPrefix}: ${formatDecimalPlaces(previousTotals.conversoes)}` : undefined,
								flowsFromPrevious: true,
							},
							{
								key: "incremental",
								title: "Conversões incrementais",
								icon: Sparkles,
								value: formatDecimalPlaces(conversoesIncrementais),
								badge: <StripBadge>{formatDecimalPlaces(percentage(conversoesIncrementais, conversoes))}%</StripBadge>,
								hint: previousTotals ? `${previousPrefix}: ${formatDecimalPlaces(previousTotals.conversoesIncrementais)}` : undefined,
								flowsFromPrevious: true,
							},
						]}
					/>
				</Section.Bleed>
			</Section.Root>

			<ConversionQualityBand quality={qualityData} isLoading={qualityLoading} />

			<div className="grid w-full grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
				<CampaignsRanking
					startDate={period.startDate}
					endDate={period.endDate}
					comparingStartDate={comparingPeriod.startDate}
					comparingEndDate={comparingPeriod.endDate}
				/>
				<CampaignTriggerDistributionBlock overall={analytics} isLoading={analyticsLoading} />
			</div>

			<CampaignStatsConversionsBlock startDate={period.startDate} endDate={period.endDate} />

			<div className="h-[400px] w-full">
				<CampaignsFunnel startDate={period.startDate} endDate={period.endDate} />
			</div>
			<div className="h-[550px] w-full">
				<CampaignsBySegmentation startDate={period.startDate} endDate={period.endDate} />
			</div>
		</div>
	);
}

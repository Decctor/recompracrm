"use client";

import CampaignsBySegmentation from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsBySegmentation";
import CampaignsFunnel from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsFunnel";
import CampaignsGraphs from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsGraphs";
import CampaignsRanking from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignsRanking";
import { CampaignStatsConversionsBlock } from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignStatsConversionsBlock";
import { CampaignTriggerDistributionBlock } from "@/app/dashboard/growth/campaigns/_module/shared/stats/CampaignTriggerDistributionBlock";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { resolveCampaignStatsComparisonPeriod } from "@/lib/campaigns/stats-period";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCampaignStatsOverall, useConversionQuality } from "@/lib/queries/campaigns";
import dayjs from "dayjs";
import { BadgeDollarSign, Grid3x3, MessageCircle, MousePointerClick, RefreshCw, SparklesIcon, TrendingUp, UserPlus, Zap } from "lucide-react";
import { useState } from "react";

export function CampaignsStatsView() {
	const initialStartDate = dayjs().startOf("month");
	const initialEndDate = dayjs().endOf("month");
	const [filters, setFilters] = useState<{
		startDate: Date | null;
		endDate: Date | null;
	}>({
		startDate: initialStartDate.toDate(),
		endDate: initialEndDate.toDate(),
	});
	const [comparingFilters, setComparingFilters] = useState<{
		startDate: Date | null;
		endDate: Date | null;
	}>(() => resolveCampaignStatsComparisonPeriod({ startDate: initialStartDate.toDate(), endDate: initialEndDate.toDate() }));
	const { data: analytics, isLoading: analyticsLoading } = useCampaignStatsOverall({
		startDate: filters.startDate ?? undefined,
		endDate: filters.endDate ?? undefined,
	});

	const { data: qualityData } = useConversionQuality({
		startDate: filters.startDate ?? undefined,
		endDate: filters.endDate ?? undefined,
	});

	const totals = analytics?.totais;

	// Calculate quality percentages
	const aquisicoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "AQUISICAO");
	const reativacoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "REATIVACAO");
	const aceleracoes = qualityData?.distribuicaoTipos.find((t) => t.tipo === "ACELERACAO");

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="hover:bg-accent hover:text-accent-foreground border-none shadow-none"
					value={{
						after: filters.startDate ? new Date(filters.startDate) : undefined,
						before: filters.endDate ? new Date(filters.endDate) : undefined,
					}}
					handleChange={(value) => {
						const newStartDate = value.after ? new Date(value.after) : null;
						const newEndDate = value.before ? new Date(value.before) : null;

						setFilters({
							startDate: newStartDate,
							endDate: newEndDate,
						});

						// Auto-update comparison period
						if (newStartDate && newEndDate) {
							setComparingFilters(resolveCampaignStatsComparisonPeriod({ startDate: newStartDate, endDate: newEndDate }));
						}
					}}
				/>
			</div>

			{/* Primary KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="CAMPANHAS ATIVAS"
					icon={<Grid3x3 className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.campanhasAtivas || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="INTERAÇÕES"
					icon={<MessageCircle className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.interacoes || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="CONVERSÕES"
					icon={<MousePointerClick className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.conversoes || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="CONVERSÕES INCREMENTAIS"
					icon={<SparklesIcon className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.conversoesIncrementais || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="TAXA DE CONVERSÃO"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.taxaConversaoGeral || 0,
						format: (n) => `${formatDecimalPlaces(n)}%`,
					}}
				/>
				<StatUnitCard
					title="RECEITA GERADA"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.receita || 0,
						format: (n) => formatToMoney(n),
					}}
				/>
				<StatUnitCard
					title="RECEITA INCREMENTAL"
					icon={<SparklesIcon className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: totals?.receitaIncremental || 0,
						format: (n) => formatToMoney(n),
					}}
				/>
			</div>
			{/* Conversion Quality KPIs */}
			<div className="w-full flex items-start flex-col lg:flex-row gap-3">
				<StatUnitCard
					title="AQUISIÇÕES"
					subtitle="Novos clientes"
					icon={<UserPlus className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: aquisicoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="REATIVAÇÕES"
					subtitle="Clientes resgatados"
					icon={<RefreshCw className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: reativacoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="ACELERAÇÕES"
					subtitle="Compraram mais rápido"
					icon={<Zap className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: aceleracoes?.quantidade || 0,
						format: (n) => formatDecimalPlaces(n),
					}}
				/>
				<StatUnitCard
					title="ANTECIPAÇÃO MÉDIA"
					subtitle="Dias economizados"
					icon={<TrendingUp className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoFrequencia?.mediasDiasAntecipados || 0,
						format: (n) => `${formatDecimalPlaces(n)} dias`,
					}}
				/>
				<StatUnitCard
					title="IMPACTO NO TICKET"
					subtitle="Variação média"
					icon={<BadgeDollarSign className="w-4 h-4 min-w-4 min-h-4" />}
					current={{
						value: qualityData?.impactoMonetario?.deltaMonetarioPercentualMedio || 0,
						format: (n) => `${n > 0 ? "+" : ""}${formatDecimalPlaces(n)}%`,
					}}
				/>
			</div>
			<CampaignStatsConversionsBlock startDate={filters.startDate} endDate={filters.endDate} />
			<div className="flex w-full flex-col items-start gap-3 lg:h-[550px] lg:flex-row">
				<div className="w-full min-h-0 min-w-0 lg:h-full lg:w-1/2">
					<CampaignsGraphs
						startDate={filters.startDate ?? null}
						endDate={filters.endDate ?? null}
						comparingStartDate={comparingFilters.startDate}
						comparingEndDate={comparingFilters.endDate}
					/>
				</div>
				<div className="w-full min-h-0 min-w-0 lg:h-full lg:w-1/2">
					<CampaignsRanking
						startDate={filters.startDate ?? null}
						endDate={filters.endDate ?? null}
						comparingStartDate={comparingFilters.startDate}
						comparingEndDate={comparingFilters.endDate}
					/>
				</div>
			</div>
			<div className="w-full h-[400px]">
				<CampaignsFunnel startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div>
			{/* Receita agrupada por tipo de gatilho — antes vivia só na aba de campanhas do dashboard. */}
			<CampaignTriggerDistributionBlock overall={analytics} isLoading={analyticsLoading} />
			<div className="w-full h-[550px]">
				<CampaignsBySegmentation startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div>
			{/* <div className="w-full h-[450px]">
				<CampaignsConversionQuality startDate={filters.startDate ?? null} endDate={filters.endDate ?? null} />
			</div> */}
		</div>
	);
}

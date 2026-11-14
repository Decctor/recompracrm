"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { CAMPAIGN_STATS_PERIOD_PRESETS, resolveCampaignStatsComparisonPeriod, type TStatsPeriod } from "@/lib/campaigns/stats-period";
import { getErrorMessage } from "@/lib/errors";
import type { TProductionPermissions } from "@/lib/permissions/productions";
import { useProductionStats } from "@/lib/queries/productions";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { InputsConsumed } from "./inputs-consumed";
import { RecipesRanking } from "./recipes-ranking";
import { ResultSection } from "./result-section";
import { StatsToolbar } from "./stats-toolbar";
import { YieldSection } from "./yield-section";

type ProductionStatsPageProps = {
	/** A rota já exige `visualizar`; nada aqui depende das demais permissões. */
	permissions: TProductionPermissions;
};

/**
 * Estatísticas de produção: resultado do período contra o anterior, rendimento, ranking de receitas e
 * insumos consumidos. Uma consulta só alimenta todos os blocos — tudo sai das produções concluídas.
 */
export default function ProductionStatsPage(_props: ProductionStatsPageProps) {
	const [period, setPeriod] = useState<TStatsPeriod>(() => CAMPAIGN_STATS_PERIOD_PRESETS[0].getValue(new Date()));
	const [recipeIds, setRecipeIds] = useState<string[]>([]);
	const comparingPeriod = useMemo(() => resolveCampaignStatsComparisonPeriod(period), [period]);

	const {
		data: stats,
		isLoading,
		isError,
		error,
		isPlaceholderData,
	} = useProductionStats({
		periodAfter: period.startDate,
		periodBefore: period.endDate,
		comparingPeriodAfter: comparingPeriod.startDate,
		comparingPeriodBefore: comparingPeriod.endDate,
		recipeIds,
	});

	return (
		<div className="flex w-full flex-col gap-3">
			<StatsToolbar period={period} onPeriodChange={setPeriod} recipeIds={recipeIds} onRecipeIdsChange={setRecipeIds} />
			{isLoading ? <LoadingComponent /> : null}
			{isError && !stats ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{stats ? (
				<div className={cn("flex w-full flex-col gap-3 transition-opacity", isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData}>
					<ResultSection stats={stats} period={period} comparingPeriod={comparingPeriod} />
					<YieldSection stats={stats} />
					<div className="grid w-full grid-cols-1 items-start gap-3 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
						<RecipesRanking ranking={stats.ranking} />
						<InputsConsumed inputs={stats.inputs} />
					</div>
				</div>
			) : null}
		</div>
	);
}

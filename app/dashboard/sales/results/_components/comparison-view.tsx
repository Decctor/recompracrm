"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { StatEmptyState } from "@/components/SalesStats/StatEmptyState";
import { CommercialInlineFilters } from "@/components/Stats/CommercialInlineFilters";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import { getErrorMessage } from "@/lib/errors";
import { buildComparisonPeriodPresets, matchPeriodPreset } from "@/lib/period-presets";
import { useSalesComparison } from "@/lib/queries/stats/comparison";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import dayjs from "dayjs";
import { ChartNoAxesColumnIncreasing, GitCompare } from "lucide-react";
import { parseAsArrayOf, parseAsFloat, parseAsIsoDateTime, parseAsString, useQueryStates } from "nuqs";
import { ComparisonChartBlock } from "./comparison-chart-block";
import { ComparisonRankingsBlock } from "./comparison-rankings-block";
import { ComparisonSummaryBlock } from "./comparison-summary-block";

type ComparisonViewProps = {
	/** Ids de vendedor do escopo de resultados do membro; `null` = sem escopo (organização inteira). */
	scopeSellersIds: string[] | null;
};

// Período padrão: o mês até hoje, o mesmo da análise comercial.
const defaultAfter = dayjs().startOf("month").toDate();
const defaultBefore = dayjs().endOf("day").toDate();

/**
 * Comparativo de dois períodos. O período base e os filtros são os mesmos da análise comercial; o
 * período de comparação acompanha o base ("período anterior") até o usuário fixar outro, e tudo
 * vive na URL para que a comparação possa ser compartilhada.
 */
export function ComparisonView({ scopeSellersIds }: ComparisonViewProps) {
	const [params, setParams] = useQueryStates(
		{
			after: parseAsIsoDateTime.withDefault(defaultAfter),
			before: parseAsIsoDateTime.withDefault(defaultBefore),
			compareAfter: parseAsIsoDateTime,
			compareBefore: parseAsIsoDateTime,
			sellersIds: parseAsArrayOf(parseAsString).withDefault([]),
			integrationsIds: parseAsArrayOf(parseAsString).withDefault([]),
			clientRFMTitles: parseAsArrayOf(parseAsString).withDefault([]),
			excludedSalesIds: parseAsArrayOf(parseAsString).withDefault([]),
			totalMin: parseAsFloat,
			totalMax: parseAsFloat,
		},
		{ history: "replace" },
	);

	const base = { after: params.after, before: params.before };
	const comparisonPresets = buildComparisonPeriodPresets(base);
	const isComparisonPinned = params.compareAfter !== null && params.compareBefore !== null;
	const comparacao =
		params.compareAfter !== null && params.compareBefore !== null
			? { after: params.compareAfter, before: params.compareBefore }
			: (() => {
					const previous = comparisonPresets[0].getValue(new Date());
					return { after: previous.from, before: previous.to };
				})();
	const matchedComparisonPreset = matchPeriodPreset(comparisonPresets, comparacao);

	const queryParams: TSaleStatsGeneralQueryParams = {
		period: { after: params.after.toISOString(), before: params.before.toISOString() },
		total: { min: params.totalMin, max: params.totalMax },
		sellersIds: params.sellersIds,
		integrationsIds: params.integrationsIds,
		clientRFMTitles: params.clientRFMTitles,
		excludedSalesIds: params.excludedSalesIds,
	};

	function updateQueryParams(next: Partial<TSaleStatsGeneralQueryParams>) {
		void setParams({
			...(next.period ? { after: new Date(next.period.after), before: new Date(next.period.before) } : {}),
			...(next.total ? { totalMin: next.total.min ?? null, totalMax: next.total.max ?? null } : {}),
			...(next.sellersIds ? { sellersIds: next.sellersIds } : {}),
			...(next.integrationsIds ? { integrationsIds: next.integrationsIds } : {}),
			...(next.clientRFMTitles ? { clientRFMTitles: next.clientRFMTitles } : {}),
			...(next.excludedSalesIds ? { excludedSalesIds: next.excludedSalesIds } : {}),
		});
	}

	const { data, isLoading, isError, error } = useSalesComparison({
		base,
		comparacao,
		filters: {
			total: queryParams.total,
			sellersIds: queryParams.sellersIds,
			integrationsIds: queryParams.integrationsIds,
			clientRFMTitles: queryParams.clientRFMTitles,
			excludedSalesIds: queryParams.excludedSalesIds,
		},
	});

	const hasSales = (data?.qtdeVendas.base ?? 0) > 0 || (data?.qtdeVendas.comparacao ?? 0) > 0;

	return (
		<div className="flex w-full flex-col gap-4">
			<CommercialInlineFilters scopeSellersIds={scopeSellersIds} queryParams={queryParams} updateQueryParams={updateQueryParams}>
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<GitCompare className="h-4 w-4" />
							<InteractiveFilter.Label>COMPARAR COM</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{matchedComparisonPreset ? matchedComparisonPreset.label : formatInteractiveDateRangeSummary(comparacao.after, comparacao.before)}
						</InteractiveFilter.Value>
						{isComparisonPinned ? <InteractiveFilter.Clear onClear={() => void setParams({ compareAfter: null, compareBefore: null })} /> : null}
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: comparacao.after, to: comparacao.before }}
							presets={comparisonPresets}
							onChange={(period) =>
								void setParams({
									compareAfter: period.from ? dayjs(period.from).startOf("day").toDate() : comparacao.after,
									compareBefore: period.to ? dayjs(period.to).endOf("day").toDate() : comparacao.before,
								})
							}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</CommercialInlineFilters>

			{isLoading ? (
				<LoadingComponent />
			) : isError ? (
				<ErrorComponent msg={getErrorMessage(error)} />
			) : !data ? null : !hasSales ? (
				<StatEmptyState
					icon={ChartNoAxesColumnIncreasing}
					title="Nenhuma venda nos dois períodos"
					description="Ajuste os períodos ou os filtros para ver a comparação."
				/>
			) : (
				<>
					<ComparisonSummaryBlock data={data} />
					<ComparisonChartBlock data={data} />
					<ComparisonRankingsBlock data={data} />
				</>
			)}
		</div>
	);
}

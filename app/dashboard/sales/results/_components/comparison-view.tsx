"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { StatEmptyState } from "@/components/SalesStats/StatEmptyState";
import { CommercialInlineFilters } from "@/components/Stats/CommercialInlineFilters";
import { ComparisonPeriodFilter } from "@/components/Stats/ComparisonPeriodFilter";
import { getErrorMessage } from "@/lib/errors";
import { COMPARISON_PRESET_IDS, DEFAULT_COMPARISON_PRESET_ID, type TComparisonSelection, resolveComparisonPeriod } from "@/lib/period-presets";
import { useSalesComparison } from "@/lib/queries/stats/comparison";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import dayjs from "dayjs";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { parseAsArrayOf, parseAsFloat, parseAsIsoDateTime, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
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
 * Comparativo de dois períodos. O período base e os filtros são os mesmos da análise comercial, e
 * tudo vive na URL para que a comparação possa ser compartilhada. Uma regra (`compare`) acompanha o
 * período base; só o recorte personalizado (`compareAfter`/`compareBefore`) fixa datas.
 */
export function ComparisonView({ scopeSellersIds }: ComparisonViewProps) {
	const [params, setParams] = useQueryStates(
		{
			after: parseAsIsoDateTime.withDefault(defaultAfter),
			before: parseAsIsoDateTime.withDefault(defaultBefore),
			compare: parseAsStringLiteral(COMPARISON_PRESET_IDS),
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
	const comparisonSelection: TComparisonSelection =
		params.compareAfter !== null && params.compareBefore !== null
			? { kind: "custom", after: params.compareAfter, before: params.compareBefore }
			: { kind: "preset", presetId: params.compare ?? DEFAULT_COMPARISON_PRESET_ID };
	// O "agora" vai ao minuto: a chave da consulta não muda a cada render.
	const referenceDate = dayjs().startOf("minute").toDate();
	// Sem "sem comparação" aqui, a seleção sempre resolve num recorte.
	const comparacao = resolveComparisonPeriod(comparisonSelection, base, referenceDate) ?? base;

	function updateComparison(next: TComparisonSelection) {
		if (next.kind === "custom") void setParams({ compare: null, compareAfter: next.after, compareBefore: next.before });
		else if (next.kind === "preset")
			void setParams({ compare: next.presetId === DEFAULT_COMPARISON_PRESET_ID ? null : next.presetId, compareAfter: null, compareBefore: null });
	}

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
				<ComparisonPeriodFilter base={base} referenceDate={referenceDate} value={comparisonSelection} onChange={updateComparison} />
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

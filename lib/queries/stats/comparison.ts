import type { TGetSalesComparisonOutput } from "@/app/api/stats/comparison/route";
import { useDebounceMemo } from "@/lib/hooks/use-debounce";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export type TSalesComparisonParams = {
	base: { after: Date; before: Date };
	comparacao: { after: Date; before: Date };
	filters: Omit<TSaleStatsGeneralQueryParams, "period">;
};

async function fetchSalesComparison(params: TSalesComparisonParams) {
	const searchParams = new URLSearchParams();
	searchParams.set("baseAfter", params.base.after.toISOString());
	searchParams.set("baseBefore", params.base.before.toISOString());
	searchParams.set("compareAfter", params.comparacao.after.toISOString());
	searchParams.set("compareBefore", params.comparacao.before.toISOString());
	if (params.filters.sellersIds.length > 0) searchParams.set("sellersIds", params.filters.sellersIds.join(","));
	if (params.filters.integrationsIds.length > 0) searchParams.set("integrationsIds", params.filters.integrationsIds.join(","));
	if (params.filters.clientRFMTitles.length > 0) searchParams.set("clientRFMTitles", params.filters.clientRFMTitles.join(","));
	if (params.filters.excludedSalesIds.length > 0) searchParams.set("excludedSalesIds", params.filters.excludedSalesIds.join(","));
	if (params.filters.total.min != null) searchParams.set("totalMin", String(params.filters.total.min));
	if (params.filters.total.max != null) searchParams.set("totalMax", String(params.filters.total.max));
	const { data } = await axios.get<TGetSalesComparisonOutput>(`/api/stats/comparison?${searchParams.toString()}`);
	return data.data;
}

/** O estado dos períodos e filtros vive na URL (página); o hook só debounça e busca. */
export function useSalesComparison(params: TSalesComparisonParams) {
	const debouncedParams = useDebounceMemo(params, 400);
	const queryKey = ["sales-comparison", debouncedParams];
	return {
		...useQuery({ queryKey, queryFn: () => fetchSalesComparison(debouncedParams), refetchOnWindowFocus: false }),
		queryKey,
		debouncedParams,
	};
}

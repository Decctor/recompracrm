import type { TGetSalesResultsOutput } from "@/app/api/sales/results/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDebounceMemo } from "../hooks/use-debounce";

export type TSalesResultsParams = {
	after: Date;
	before: Date;
	sellersIds: string[];
	channels: string[];
	excludedFinancialAccountIds: string[];
};

async function fetchSalesResults(params: TSalesResultsParams) {
	const searchParams = new URLSearchParams();
	searchParams.set("after", params.after.toISOString());
	searchParams.set("before", params.before.toISOString());
	if (params.sellersIds.length > 0) searchParams.set("sellersIds", params.sellersIds.join(","));
	if (params.channels.length > 0) searchParams.set("channels", params.channels.join(","));
	if (params.excludedFinancialAccountIds.length > 0) searchParams.set("excludedFinancialAccountIds", params.excludedFinancialAccountIds.join(","));
	const { data } = await axios.get<TGetSalesResultsOutput>(`/api/sales/results?${searchParams.toString()}`);
	return data.data;
}

/** O estado dos filtros vive na URL (página); o hook só debounça e busca. */
export function useSalesResults(params: TSalesResultsParams) {
	const debouncedParams = useDebounceMemo(params, 400);
	const queryKey = ["sales-results", debouncedParams];
	return {
		...useQuery({ queryKey, queryFn: () => fetchSalesResults(debouncedParams) }),
		queryKey,
		debouncedParams,
	};
}

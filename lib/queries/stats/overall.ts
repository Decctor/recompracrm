import type { TOverallSalesStats } from "@/app/api/stats/sales-overall/route";
import type { TSalesOverallStatsFilters } from "@/schemas/query-params-utils";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchOverallSalesStats(filters: TSalesOverallStatsFilters) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("payload", JSON.stringify(filters));
		const { data } = await axios.get(`/api/stats/sales-overall?${searchParams.toString()}`);
		return data.data as TOverallSalesStats;
	} catch (error) {
		console.log("Error running fetchOverallSalesStats");
		throw error;
	}
}

export function useOverallSalesStats(filters: TSalesOverallStatsFilters) {
	return useQuery({
		queryKey: ["overall-sales-stats", filters],
		queryFn: async () => await fetchOverallSalesStats(filters),
		refetchOnWindowFocus: false,
	});
}

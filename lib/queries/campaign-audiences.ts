import type { TGetCampaignAudiencesInput, TGetCampaignAudiencesOutput } from "@/app/api/campaign-audiences/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

// ============================================================================
// CAMPAIGN AUDIENCES — LIST
// ============================================================================

async function fetchCampaignAudiences(input: Omit<TGetCampaignAudiencesInput, "id">) {
	try {
		const searchParams = new URLSearchParams();
		if (input.search) searchParams.set("search", input.search);
		if (input.page) searchParams.set("page", input.page.toString());
		const { data } = await axios.get<TGetCampaignAudiencesOutput>(`/api/campaign-audiences?${searchParams.toString()}`);
		if (!data.data.default) throw new Error("Públicos não encontrados.");
		return data.data.default;
	} catch (error) {
		console.log("Error running fetchCampaignAudiences", error);
		throw error;
	}
}

type UseCampaignAudiencesParams = {
	initialFilters: Omit<TGetCampaignAudiencesInput, "id">;
};
export function useCampaignAudiences({ initialFilters }: UseCampaignAudiencesParams) {
	const [filters, setFilters] = useState<Omit<TGetCampaignAudiencesInput, "id">>(initialFilters);
	function updateFilters(newFilters: Partial<Omit<TGetCampaignAudiencesInput, "id">>) {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 500);
	return {
		...useQuery({
			queryKey: ["campaign-audiences", debouncedFilters],
			queryFn: async () => await fetchCampaignAudiences(debouncedFilters),
		}),
		queryKey: ["campaign-audiences", debouncedFilters] as const,
		filters,
		updateFilters,
	};
}

// ============================================================================
// CAMPAIGN AUDIENCE — BY ID
// ============================================================================

async function fetchCampaignAudienceById(id: string) {
	try {
		const { data } = await axios.get<TGetCampaignAudiencesOutput>(`/api/campaign-audiences?id=${id}`);
		if (!data.data.byId) throw new Error("Público não encontrado.");
		return data.data.byId;
	} catch (error) {
		console.log("Error running fetchCampaignAudienceById", error);
		throw error;
	}
}

export function useCampaignAudienceById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["campaign-audience-by-id", id],
			queryFn: async () => await fetchCampaignAudienceById(id),
		}),
		queryKey: ["campaign-audience-by-id", id] as const,
	};
}

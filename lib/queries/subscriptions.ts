import type { TGetSubscriptionAddonsOutput } from "@/app/api/organizations/subscription/addons/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchSubscriptionAddons() {
	const { data } = await axios.get<TGetSubscriptionAddonsOutput>("/api/organizations/subscription/addons");
	return data.data;
}

export function useSubscriptionAddons({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["organization-subscription-addons"];
	return {
		...useQuery({ queryKey, queryFn: fetchSubscriptionAddons, enabled, staleTime: 60 * 1000 }),
		queryKey,
	};
}

import type { TGetDealsInput, TGetDealsOutput } from "@/app/api/admin/deals/route";
import type { TGetAvailableDealLicenseOutput } from "@/app/api/deals/available-license/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchAdminDeals(input: TGetDealsInput) {
	const searchParams = new URLSearchParams();
	if (input.id) searchParams.set("id", input.id);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	if (input.search) searchParams.set("search", input.search);

	const queryString = searchParams.toString();
	const response = await axios.get<TGetDealsOutput>(`/api/admin/deals?${queryString}`);
	const defaultResult = response.data.data.default;
	if (!defaultResult) throw new Error("Deals não encontrados.");
	return defaultResult;
}

async function fetchAdminDealById(id: string) {
	const response = await axios.get<TGetDealsOutput>(`/api/admin/deals?id=${id}`);
	const byIdResult = response.data.data.byId;
	if (!byIdResult) throw new Error("Deal não encontrado.");
	return byIdResult;
}

export function useAdminDeals() {
	const [params, setParams] = useState<TGetDealsInput>({
		page: 1,
		pageSize: DEFAULT_PAGE_SIZE,
		search: null,
	});

	function updateParams(newParams: Partial<TGetDealsInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedSearch = useDebounceMemo({ search: params.search }, 1000);
	const finalParams = { ...params, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["admin-deals", finalParams],
			queryFn: () => fetchAdminDeals(finalParams),
		}),
		queryKey: ["admin-deals", finalParams],
		params,
		updateParams,
	};
}

export function useAdminDealById({ dealId }: { dealId: string }) {
	return {
		...useQuery({
			queryKey: ["admin-deal-by-id", dealId],
			queryFn: () => fetchAdminDealById(dealId),
		}),
		queryKey: ["admin-deal-by-id", dealId],
	};
}

async function fetchAvailableDealLicense() {
	const response = await axios.get<TGetAvailableDealLicenseOutput>("/api/deals/available-license");
	return response.data.data;
}

// Licença de deal disponível para o usuário logado (obtentor) — consumido pelo onboarding
// para pular a etapa de plano/checkout quando a organização nasce coberta por um deal.
export function useAvailableDealLicense() {
	return {
		...useQuery({
			queryKey: ["available-deal-license"],
			queryFn: fetchAvailableDealLicense,
		}),
		queryKey: ["available-deal-license"],
	};
}

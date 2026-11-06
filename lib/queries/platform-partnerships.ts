import type { TGetAdminPlatformPartnerCommissionsOutput } from "@/app/api/admin/platform-partners/commissions/route";
import type { TGetAdminPlatformPartnerPayoutsOutput } from "@/app/api/admin/platform-partners/payouts/route";
import type { TGetAdminPlatformPartnerReferralsOutput } from "@/app/api/admin/platform-partners/referrals/route";
import type { TGetAdminPlatformPartnersInput, TGetAdminPlatformPartnersOutput } from "@/app/api/admin/platform-partners/route";
import type { TGetPlatformPartnerDashboardOutput } from "@/app/api/platform-partner/dashboard/route";
import type { TGetPlatformPartnerMeOutput } from "@/app/api/platform-partner/me/route";
import type { TGetPlatformPartnerPayoutsOutput } from "@/app/api/platform-partner/payouts/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchPlatformPartnerMe() {
	const { data } = await axios.get<TGetPlatformPartnerMeOutput>("/api/platform-partner/me");
	return data.data.partner;
}

export function usePlatformPartnerMe() {
	const queryKey = ["platform-partner-me"];
	return {
		...useQuery({ queryKey, queryFn: fetchPlatformPartnerMe }),
		queryKey,
	};
}

async function fetchPlatformPartnerDashboard() {
	const { data } = await axios.get<TGetPlatformPartnerDashboardOutput>("/api/platform-partner/dashboard");
	return data.data;
}

export function usePlatformPartnerDashboard() {
	const queryKey = ["platform-partner-dashboard"];
	return {
		...useQuery({ queryKey, queryFn: fetchPlatformPartnerDashboard }),
		queryKey,
	};
}

async function fetchPlatformPartnerPayouts() {
	const { data } = await axios.get<TGetPlatformPartnerPayoutsOutput>("/api/platform-partner/payouts");
	return data.data.payouts;
}

export function usePlatformPartnerPayouts() {
	const queryKey = ["platform-partner-payouts"];
	return {
		...useQuery({ queryKey, queryFn: fetchPlatformPartnerPayouts }),
		queryKey,
	};
}

async function fetchAdminPlatformPartners(input: TGetAdminPlatformPartnersInput) {
	const searchParams = new URLSearchParams();
	if (input.id) searchParams.set("id", input.id);
	if (input.search) searchParams.set("search", input.search);
	if (input.status) searchParams.set("status", input.status);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	const { data } = await axios.get<TGetAdminPlatformPartnersOutput>(`/api/admin/platform-partners?${searchParams.toString()}`);
	return data.data;
}

export function useAdminPlatformPartners({ initialParams }: { initialParams?: Partial<TGetAdminPlatformPartnersInput> }) {
	const [queryParams, setQueryParams] = useState<TGetAdminPlatformPartnersInput>({
		id: initialParams?.id ?? null,
		search: initialParams?.search ?? "",
		status: initialParams?.status ?? null,
		page: initialParams?.page ?? 1,
		pageSize: initialParams?.pageSize ?? DEFAULT_PAGE_SIZE,
	});
	const debouncedParams = useDebounceMemo(queryParams, 400);
	const queryKey = ["admin-platform-partners", debouncedParams];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAdminPlatformPartners(debouncedParams) }),
		queryKey,
		queryParams,
		updateQueryParams: (params: Partial<TGetAdminPlatformPartnersInput>) => setQueryParams((prev) => ({ ...prev, ...params })),
	};
}

async function fetchAdminPlatformPartnerById(id: string) {
	const result = await fetchAdminPlatformPartners({ id, search: null, status: null, page: 1 });
	if (!result.byId) throw new Error("Parceiro nao encontrado.");
	return result.byId;
}

export function useAdminPlatformPartnerById(id: string | null) {
	const queryKey = ["admin-platform-partner-by-id", id];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAdminPlatformPartnerById(id as string), enabled: !!id }),
		queryKey,
	};
}

async function fetchAdminPlatformPartnerCommissions(params: { partnerId?: string | null; status?: string | null }) {
	const searchParams = new URLSearchParams();
	if (params.partnerId) searchParams.set("partnerId", params.partnerId);
	if (params.status) searchParams.set("status", params.status);
	const { data } = await axios.get<TGetAdminPlatformPartnerCommissionsOutput>(`/api/admin/platform-partners/commissions?${searchParams.toString()}`);
	return data.data.commissions;
}

export function useAdminPlatformPartnerCommissions(params: { partnerId?: string | null; status?: string | null }) {
	const queryKey = ["admin-platform-partner-commissions", params];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAdminPlatformPartnerCommissions(params) }),
		queryKey,
	};
}

async function fetchAdminPlatformPartnerReferrals(params: { partnerId?: string | null; status?: string | null }) {
	const searchParams = new URLSearchParams();
	if (params.partnerId) searchParams.set("partnerId", params.partnerId);
	if (params.status) searchParams.set("status", params.status);
	const { data } = await axios.get<TGetAdminPlatformPartnerReferralsOutput>(`/api/admin/platform-partners/referrals?${searchParams.toString()}`);
	return data.data.referrals;
}

export function useAdminPlatformPartnerReferrals(params: { partnerId?: string | null; status?: string | null }) {
	const queryKey = ["admin-platform-partner-referrals", params];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAdminPlatformPartnerReferrals(params) }),
		queryKey,
	};
}

async function fetchAdminPlatformPartnerPayouts(params: { partnerId?: string | null }) {
	const searchParams = new URLSearchParams();
	if (params.partnerId) searchParams.set("partnerId", params.partnerId);
	const { data } = await axios.get<TGetAdminPlatformPartnerPayoutsOutput>(`/api/admin/platform-partners/payouts?${searchParams.toString()}`);
	return data.data.payouts;
}

export function useAdminPlatformPartnerPayouts(params: { partnerId?: string | null }) {
	const queryKey = ["admin-platform-partner-payouts", params];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAdminPlatformPartnerPayouts(params) }),
		queryKey,
	};
}

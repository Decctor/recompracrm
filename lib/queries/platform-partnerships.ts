import type { TGetAdminPlatformPartnerPayoutReceiptOutput } from "@/app/api/admin/platform-partners/payouts/receipt/route";
import type { TGetAdminPlatformPartnerDocumentOutput } from "@/app/api/admin/platform-partners/documents/route";
import type { TGetAdminPlatformPartnerCommissionsOutput } from "@/app/api/admin/platform-partners/commissions/route";
import type { TGetAdminPlatformPartnerPayoutsOutput } from "@/app/api/admin/platform-partners/payouts/route";
import type { TGetAdminPlatformPartnerReferralsOutput } from "@/app/api/admin/platform-partners/referrals/route";
import type { TGetAdminPlatformPartnersInput, TGetAdminPlatformPartnersOutput } from "@/app/api/admin/platform-partners/route";
import type { TGetPlatformPartnerDashboardOutput } from "@/app/api/platform-partner/dashboard/route";
import type { TGetPlatformPartnerMeOutput } from "@/app/api/platform-partner/me/route";
import type { TGetPlatformPartnerPayoutsOutput } from "@/app/api/platform-partner/payouts/route";
import type { TGetPlatformPartnerReferralsOutput } from "@/app/api/platform-partner/referrals/route";
import type { TValidatePlatformPartnerCodeOutput } from "@/app/api/platform-partners/validate-code/route";
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

async function fetchPlatformPartnerPayoutById(id: string) {
	const searchParams = new URLSearchParams({ id });
	const { data } = await axios.get<TGetPlatformPartnerPayoutsOutput>(`/api/platform-partner/payouts?${searchParams.toString()}`);
	return data.data.byId;
}

export function usePlatformPartnerPayoutById({ payoutId }: { payoutId: string }) {
	const queryKey = ["platform-partner-payout-by-id", payoutId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchPlatformPartnerPayoutById(payoutId) }),
		queryKey,
	};
}

async function fetchPlatformPartnerStoreById(id: string) {
	const searchParams = new URLSearchParams({ id });
	const { data } = await axios.get<TGetPlatformPartnerReferralsOutput>(`/api/platform-partner/referrals?${searchParams.toString()}`);
	return data.data.byId;
}

export function usePlatformPartnerStoreById({ storeId }: { storeId: string }) {
	const queryKey = ["platform-partner-store-by-id", storeId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchPlatformPartnerStoreById(storeId) }),
		queryKey,
	};
}

async function fetchAdminPlatformPartners(input: TGetAdminPlatformPartnersInput) {
	const searchParams = new URLSearchParams();
	if (input.id) searchParams.set("id", input.id);
	if (input.search) searchParams.set("search", input.search);
	if (input.status) searchParams.set("status", input.status);
	if (input.page) searchParams.set("page", input.page.toString());
	const { data } = await axios.get<TGetAdminPlatformPartnersOutput>(`/api/admin/platform-partners?${searchParams.toString()}`);
	return data.data;
}

export function useAdminPlatformPartners({ initialParams }: { initialParams?: Partial<TGetAdminPlatformPartnersInput> }) {
	const [queryParams, setQueryParams] = useState<TGetAdminPlatformPartnersInput>({
		id: initialParams?.id ?? null,
		search: initialParams?.search ?? "",
		status: initialParams?.status ?? null,
		page: initialParams?.page ?? 1,
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

/** URL assinada (curta) do documento do parceiro. Busca sob demanda, no clique do admin. */
export async function fetchAdminPlatformPartnerDocumentUrl({
	partnerId,
	tipo,
	pedido = false,
}: {
	partnerId: string;
	tipo: "cpf" | "cnpj";
	pedido?: boolean;
}) {
	const searchParams = new URLSearchParams({ partnerId, tipo });
	if (pedido) searchParams.set("pedido", "true");
	const { data } = await axios.get<TGetAdminPlatformPartnerDocumentOutput>(`/api/admin/platform-partners/documents?${searchParams.toString()}`);
	return data.data.url;
}

/** Valida um código de indicação digitado pelo lojista. Pública: não exige sessão de parceiro. */
export async function fetchPlatformPartnerCodeValidation(codigo: string) {
	const searchParams = new URLSearchParams({ codigo });
	const { data } = await axios.get<TValidatePlatformPartnerCodeOutput>(`/api/platform-partners/validate-code?${searchParams.toString()}`);
	return data.data;
}

export function usePlatformPartnerCodeValidation({ codigo }: { codigo: string }) {
	const debounced = useDebounceMemo({ codigo: codigo.trim().toUpperCase() }, 400);
	const queryKey = ["platform-partner-code-validation", debounced.codigo];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchPlatformPartnerCodeValidation(debounced.codigo),
			enabled: debounced.codigo.length >= 3,
			staleTime: 60_000,
		}),
		queryKey,
		isDebouncing: debounced.codigo !== codigo.trim().toUpperCase(),
	};
}

/** URL assinada (curta) do comprovante de um payout, para o admin conferir. */
export async function fetchAdminPlatformPartnerPayoutReceiptUrl({ payoutId }: { payoutId: string }) {
	const searchParams = new URLSearchParams({ payoutId });
	const { data } = await axios.get<TGetAdminPlatformPartnerPayoutReceiptOutput>(
		`/api/admin/platform-partners/payouts/receipt?${searchParams.toString()}`,
	);
	return data.data.url;
}

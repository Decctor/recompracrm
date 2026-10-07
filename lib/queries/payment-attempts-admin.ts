import type { TGetAdminPaymentAttemptsInput, TGetAdminPaymentAttemptsOutput } from "@/app/api/admin/payment-attempts/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export type { TAdminPaymentAttemptListItem } from "@/app/api/admin/payment-attempts/route";

type TAdminPaymentAttemptsParams = { status?: TGetAdminPaymentAttemptsInput["status"]; organizationId?: string | null; page?: number };

async function fetchAdminPaymentAttempts(params: TAdminPaymentAttemptsParams) {
	const searchParams = new URLSearchParams();
	if (params.status && params.status.length > 0) searchParams.set("status", params.status.join(","));
	if (params.organizationId) searchParams.set("organizationId", params.organizationId);
	if (params.page && params.page > 1) searchParams.set("page", String(params.page));
	const query = searchParams.toString();
	const { data } = await axios.get<TGetAdminPaymentAttemptsOutput>(`/api/admin/payment-attempts${query ? `?${query}` : ""}`);
	return data.data;
}

export function getAdminPaymentAttemptsQueryKey(params: TAdminPaymentAttemptsParams) {
	return ["admin-payment-attempts", params.status ?? [], params.organizationId ?? null, params.page ?? 1] as const;
}

// Tentativas que exigem atenção, atualizadas a cada 30 s: um incidente em andamento muda enquanto
// o suporte olha para a tela.
export function useAdminPaymentAttempts(params: TAdminPaymentAttemptsParams = {}) {
	const queryKey = getAdminPaymentAttemptsQueryKey(params);
	return { ...useQuery({ queryKey, queryFn: () => fetchAdminPaymentAttempts(params), refetchInterval: 30 * 1000 }), queryKey };
}

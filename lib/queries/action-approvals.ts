import type { TGetActionApprovalsOutput } from "@/app/api/action-approvals/route";
import type { TGetSaleDiscountContextOutput } from "@/app/api/pos/sales/discount-context/route";
import type { TActionApprovalStatusEnum } from "@/schemas/enums";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchActionApprovals(status: TActionApprovalStatusEnum) {
	const searchParams = new URLSearchParams();
	searchParams.set("status", status);
	const { data } = await axios.get<TGetActionApprovalsOutput>(`/api/action-approvals?${searchParams.toString()}`);
	return data.data.default ?? [];
}

type ActionApprovalHistoryFilters = {
	search: string;
	periodAfter: Date | null;
	periodBefore: Date | null;
};

async function fetchActionApprovalHistory(filters: ActionApprovalHistoryFilters) {
	const searchParams = new URLSearchParams({ scope: "HISTORY" });
	if (filters.search) searchParams.set("search", filters.search);
	if (filters.periodAfter) searchParams.set("periodAfter", filters.periodAfter.toISOString());
	if (filters.periodBefore) searchParams.set("periodBefore", filters.periodBefore.toISOString());
	const { data } = await axios.get<TGetActionApprovalsOutput>(`/api/action-approvals?${searchParams.toString()}`);
	return data.data.default ?? [];
}

export function useActionApprovalHistory({ initialFilters }: { initialFilters?: Partial<ActionApprovalHistoryFilters> } = {}) {
	const [filters, setFilters] = useState<ActionApprovalHistoryFilters>({
		search: initialFilters?.search ?? "",
		periodAfter: initialFilters?.periodAfter ?? null,
		periodBefore: initialFilters?.periodBefore ?? null,
	});
	const debouncedSearch = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debouncedSearch };
	const queryKey = ["action-approval-history", finalFilters];

	return {
		...useQuery({ queryKey, queryFn: () => fetchActionApprovalHistory(finalFilters) }),
		queryKey,
		filters,
		updateFilters: (newFilters: Partial<ActionApprovalHistoryFilters>) => setFilters((previous) => ({ ...previous, ...newFilters })),
		debouncedFilters: finalFilters,
	};
}

export function useActionApprovals({ status = "PENDENTE", enabled = true }: { status?: TActionApprovalStatusEnum; enabled?: boolean } = {}) {
	const queryKey = ["action-approvals", status];
	return {
		...useQuery({ queryKey, queryFn: () => fetchActionApprovals(status), enabled }),
		queryKey,
	};
}

async function fetchActionApprovalById(requestId: string) {
	const { data } = await axios.get<TGetActionApprovalsOutput>(`/api/action-approvals?id=${requestId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Solicitação de aprovação não encontrada.");
	return result;
}

export function useActionApprovalById({
	requestId,
	enabled = true,
	refetchInterval,
}: {
	requestId: string | null;
	enabled?: boolean;
	refetchInterval?: number;
}) {
	const queryKey = ["action-approval-by-id", requestId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchActionApprovalById(requestId as string),
			enabled: enabled && !!requestId,
			refetchInterval,
		}),
		queryKey,
	};
}

async function fetchSaleDiscountContext(vendedorId: string | null) {
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	const { data } = await axios.get<TGetSaleDiscountContextOutput>(`/api/pos/sales/discount-context?${searchParams.toString()}`);
	return data.data;
}

/** Autoridade de desconto da identidade avaliada (vendedor selecionado no PDV) para feedback imediato. */
export function useSaleDiscountContext({ vendedorId }: { vendedorId: string | null }) {
	const queryKey = ["sale-discount-context", vendedorId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchSaleDiscountContext(vendedorId) }),
		queryKey,
	};
}

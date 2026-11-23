import type { TGetSalesSessionMovementOptionsOutput } from "@/app/api/pos/sales-sessions/movements/route";
import type { TGetSalesSessionsInput, TGetSalesSessionsOutput, TGetSalesSessionsOutputById } from "@/app/api/pos/sales-sessions/route";
import { useDebounceMemo } from "@/lib/hooks/use-debounce";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";

async function fetchSalesSessionById(id: string): Promise<TGetSalesSessionsOutputById> {
	const { data } = await axios.get<TGetSalesSessionsOutput>(`/api/pos/sales-sessions?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Sessao de venda nao encontrada.");
	return result;
}

export function useSalesSessionById({ sessionId }: { sessionId: string }) {
	const queryKey = ["sales-session-by-id", sessionId];
	return { ...useQuery({ queryKey, queryFn: () => fetchSalesSessionById(sessionId), enabled: !!sessionId }), queryKey };
}

async function fetchSalesSessionMovementOptions(sessionId: string) {
	const searchParams = new URLSearchParams({ sessaoVendaId: sessionId });
	const { data } = await axios.get<TGetSalesSessionMovementOptionsOutput>(`/api/pos/sales-sessions/movements?${searchParams.toString()}`);
	return data.data;
}

/** Contas e categorias que o modal de movimento de caixa oferece. */
export function useSalesSessionMovementOptions({ sessionId }: { sessionId: string }) {
	const queryKey = ["sales-session-movement-options", sessionId];
	return { ...useQuery({ queryKey, queryFn: () => fetchSalesSessionMovementOptions(sessionId), enabled: !!sessionId }), queryKey };
}

async function fetchOpenSalesSessions() {
	const { data } = await axios.get<TGetSalesSessionsOutput>("/api/pos/sales-sessions?status=ABERTA");
	return data.data.default?.sessions ?? [];
}

export function useActiveSalesSession({ organizationId, enabled = true }: { organizationId: string; enabled?: boolean }) {
	const queryKey = ["open-sales-sessions", organizationId];
	const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
	const query = useQuery({ queryKey, queryFn: fetchOpenSalesSessions, enabled });
	const sessions = query.data ?? [];
	const storageKey = `recompracrm:active-sales-session:${organizationId}`;

	useEffect(() => {
		if (!enabled || sessions.length === 0) {
			setActiveSessionIdState(null);
			return;
		}
		const remembered = window.localStorage.getItem(storageKey);
		const nextId = sessions.some((session) => session.id === activeSessionId)
			? activeSessionId
			: sessions.some((session) => session.id === remembered)
				? remembered
				: sessions.length === 1
					? sessions[0].id
					: null;
		setActiveSessionIdState(nextId);
		if (nextId) window.localStorage.setItem(storageKey, nextId);
		else window.localStorage.removeItem(storageKey);
	}, [activeSessionId, enabled, sessions, storageKey]);

	function setActiveSessionId(id: string | null) {
		setActiveSessionIdState(id);
		if (id) window.localStorage.setItem(storageKey, id);
		else window.localStorage.removeItem(storageKey);
	}

	return {
		...query,
		queryKey,
		sessions,
		activeSessionId,
		setActiveSessionId,
		session: sessions.find((session) => session.id === activeSessionId) ?? null,
	};
}

type SalesSessionsListParams = { page: number; status: TGetSalesSessionsInput["status"] };

async function fetchSalesSessions(params: SalesSessionsListParams) {
	const searchParams = new URLSearchParams();
	if (params.page) searchParams.set("page", params.page.toString());
	if (params.status) searchParams.set("status", params.status);
	const { data } = await axios.get<TGetSalesSessionsOutput>(`/api/pos/sales-sessions?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Erro ao listar sessoes de venda.");
	return result;
}

export function useSalesSessions({ initialParams }: { initialParams?: Partial<SalesSessionsListParams> } = {}) {
	const [params, setParams] = useState<SalesSessionsListParams>({ page: initialParams?.page ?? 1, status: initialParams?.status ?? null });
	function updateParams(newParams: Partial<SalesSessionsListParams>) {
		setParams((previous) => ({ ...previous, ...newParams, page: newParams.page ?? 1 }));
	}
	const debouncedParams = useDebounceMemo(params, 300);
	const queryKey = ["sales-sessions", debouncedParams];
	return { ...useQuery({ queryKey, queryFn: () => fetchSalesSessions(debouncedParams) }), queryKey, params, updateParams, debouncedParams };
}

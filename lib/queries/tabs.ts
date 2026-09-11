import type { TGetPreparationOutput } from "@/app/api/sales/preparation/route";
import type { TGetTabOrderRequestsOutput } from "@/app/api/tabs/order-requests/route";
import type { TGetServicePointsOutput } from "@/app/api/service-points/route";
import type { TGetServiceSettingsOutput } from "@/app/api/service-settings/route";
import type { TGetTabsOutput } from "@/app/api/tabs/route";
import type { TTabStatusEnum } from "@/schemas/enums";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useState } from "react";

// ============================================================================
// SERVICE SETTINGS
// ============================================================================

async function fetchServiceSettings() {
	const { data } = await axios.get<TGetServiceSettingsOutput>("/api/service-settings");
	return data.data.configuracoes;
}

export function useServiceSettings() {
	return {
		...useQuery({ queryKey: ["service-settings"], queryFn: fetchServiceSettings }),
		queryKey: ["service-settings"],
	};
}

// ============================================================================
// SERVICE POINTS
// ============================================================================

async function fetchServicePoints({ activeOnly }: { activeOnly?: boolean } = {}) {
	const searchParams = new URLSearchParams();
	if (activeOnly) searchParams.set("activeOnly", "true");
	const { data } = await axios.get<TGetServicePointsOutput>(`/api/service-points?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Pontos de atendimento nao encontrados.");
	return result;
}

export function useServicePoints({ activeOnly }: { activeOnly?: boolean } = {}) {
	return {
		...useQuery({ queryKey: ["service-points", activeOnly ?? false], queryFn: () => fetchServicePoints({ activeOnly }) }),
		queryKey: ["service-points", activeOnly ?? false],
	};
}

// ============================================================================
// TABS (board de contas)
// ============================================================================

export type TUseTabsParams = {
	status: TTabStatusEnum[];
	servicePointId: string | null;
};

async function fetchTabs(params: TUseTabsParams) {
	const searchParams = new URLSearchParams();
	if (params.status.length > 0) searchParams.set("status", params.status.join(","));
	if (params.servicePointId) searchParams.set("servicePointId", params.servicePointId);
	const { data } = await axios.get<TGetTabsOutput>(`/api/tabs?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Contas nao encontradas.");
	return result;
}

export function useTabs({ initialParams, enabled = true }: { initialParams?: Partial<TUseTabsParams>; enabled?: boolean } = {}) {
	const [params, setParams] = useState<TUseTabsParams>({
		status: initialParams?.status ?? ["ABERTA"],
		servicePointId: initialParams?.servicePointId ?? null,
	});

	const updateParams = useCallback((newParams: Partial<TUseTabsParams>) => {
		setParams((prev) => ({ ...prev, ...newParams }));
	}, []);

	return {
		...useQuery({
			queryKey: ["tabs", params],
			queryFn: () => fetchTabs(params),
			enabled,
			refetchInterval: 30_000,
		}),
		queryKey: ["tabs", params],
		params,
		updateParams,
	};
}

async function fetchTabById(id: string) {
	const { data } = await axios.get<TGetTabsOutput>(`/api/tabs?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Conta nao encontrada.");
	return result;
}

export function useTabById({ tabId }: { tabId: string | null }) {
	return {
		...useQuery({
			queryKey: ["tab-by-id", tabId],
			queryFn: () => fetchTabById(tabId as string),
			enabled: !!tabId,
		}),
		queryKey: ["tab-by-id", tabId],
	};
}

// ============================================================================
// SOLICITACOES DE PEDIDO VIA QR (inbox de aprovacao)
// ============================================================================

async function fetchTabOrderRequests() {
	// PROCESSANDO incluido: solicitacao presa por queda de processo continua visivel e reprocessavel.
	const { data } = await axios.get<TGetTabOrderRequestsOutput>("/api/tabs/order-requests?status=PENDENTE,ERRO,PROCESSANDO");
	return data.data.requests;
}

export function useTabOrderRequests() {
	return {
		...useQuery({
			queryKey: ["tab-order-requests"],
			queryFn: fetchTabOrderRequests,
			refetchInterval: 15_000,
		}),
		queryKey: ["tab-order-requests"],
	};
}

// ============================================================================
// PREPARO (tickets unificados)
// ============================================================================

async function fetchPreparationTickets() {
	const { data } = await axios.get<TGetPreparationOutput>("/api/sales/preparation");
	return data.data.tickets;
}

export function usePreparationTickets() {
	return {
		...useQuery({
			queryKey: ["preparation-tickets"],
			queryFn: fetchPreparationTickets,
			// Board de cozinha: atualiza sozinho enquanto a tela fica aberta.
			refetchInterval: 15_000,
		}),
		queryKey: ["preparation-tickets"],
	};
}

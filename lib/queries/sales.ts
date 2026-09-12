import type { TGetQuotesOutput } from "@/app/api/sales/quotes/route";
import type { TGetSalesInput, TGetSalesOutput } from "@/app/api/sales/route";
import type { TSalesSimplifiedSearchResult } from "@/app/api/sales/simplified-search/route";
import type { TSalesSimplifiedSearchQueryParams } from "@/schemas/sales";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";

/** Query string do histórico a partir do input; a exportação reaproveita para mandar os mesmos filtros. */
export function buildSalesSearchParams(input: Omit<TGetSalesInput, "id">) {
	const searchParams = new URLSearchParams();
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.search) searchParams.set("search", input.search);
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());
	if (input.sellersIds) searchParams.set("sellersIds", input.sellersIds.join(","));
	if (input.partnersIds) searchParams.set("partnersIds", input.partnersIds.join(","));
	if (input.integrationsIds) searchParams.set("integrationsIds", input.integrationsIds.join(","));
	if (input.clientId) searchParams.set("clientId", input.clientId);
	if (input.productGroups) searchParams.set("productGroups", input.productGroups.join(","));
	if (input.productIds) searchParams.set("productIds", input.productIds.join(","));
	if (input.totalMin !== null && input.totalMin !== undefined) searchParams.set("totalMin", input.totalMin.toString());
	if (input.totalMax !== null && input.totalMax !== undefined) searchParams.set("totalMax", input.totalMax.toString());
	if (input.financialStatuses.length > 0) searchParams.set("financialStatuses", input.financialStatuses.join(","));
	if (input.fiscalStatuses.length > 0) searchParams.set("fiscalStatuses", input.fiscalStatuses.join(","));
	if (input.paymentMethods.length > 0) searchParams.set("paymentMethods", input.paymentMethods.join(","));
	if (input.deliveryModes.length > 0) searchParams.set("deliveryModes", input.deliveryModes.join(","));
	if (input.saleStatuses.length > 0) searchParams.set("saleStatuses", input.saleStatuses.join(","));
	if (input.hasDiscount !== null && input.hasDiscount !== undefined) searchParams.set("hasDiscount", String(input.hasDiscount));
	return searchParams;
}

async function fetchSales(input: TGetSalesInput) {
	const searchParams = buildSalesSearchParams(input);
	const { data } = await axios.get<TGetSalesOutput>(`/api/sales?${searchParams.toString()}`);
	const result = input.clientId ? data.data.byClientId : data.data.default;
	if (!result) throw new Error("Vendas não encontradas.");
	return result;
}

type UseSalesParams = {
	initialParams: Partial<TGetSalesInput>;
};
export function useSales({ initialParams }: UseSalesParams) {
	const [params, setParams] = useState<TGetSalesInput>({
		page: initialParams.page || 1,
		search: initialParams.search || "",
		periodAfter: initialParams.periodAfter || null,
		periodBefore: initialParams.periodBefore || null,
		sellersIds: initialParams.sellersIds || [],
		partnersIds: initialParams.partnersIds || [],
		integrationsIds: initialParams.integrationsIds || [],
		clientId: initialParams.clientId ?? null,
		productGroups: initialParams.productGroups ?? [],
		productIds: initialParams.productIds ?? [],
		totalMin: initialParams.totalMin ?? null,
		totalMax: initialParams.totalMax ?? null,
		financialStatuses: initialParams.financialStatuses ?? [],
		fiscalStatuses: initialParams.fiscalStatuses ?? [],
		paymentMethods: initialParams.paymentMethods ?? [],
		deliveryModes: initialParams.deliveryModes ?? [],
		saleStatuses: initialParams.saleStatuses ?? [],
		hasDiscount: initialParams.hasDiscount ?? null,
	});
	function updateParams(newParams: Partial<TGetSalesInput>) {
		setParams((prev) => ({ ...prev, ...newParams }));
	}
	return { ...useSalesQuery({ params }), params, updateParams };
}

/** Consulta de vendas com parâmetros controlados de fora (ex.: estado na URL via nuqs). */
export function useSalesQuery({ params }: { params: TGetSalesInput }) {
	const queryKey = ["sales", params];
	return {
		...useQuery({
			queryKey,
			queryFn: async () => await fetchSales(params),
		}),
		queryKey,
	};
}

async function fetchSalesById({ id }: { id: string }) {
	const { data } = await axios.get<TGetSalesOutput>(`/api/sales?id=${id}`);
	if (!data.data.byId) throw new Error("Venda não encontrada.");
	return data.data.byId;
}

export function useSalesById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["sales-by-id", id],
			queryFn: async () => await fetchSalesById({ id }),
		}),
		queryKey: ["sales-by-id", id],
	};
}
async function fetchSalesSimplifiedSearch(params: TSalesSimplifiedSearchQueryParams) {
	try {
		const searchParams = new URLSearchParams();
		searchParams.set("payload", JSON.stringify(params));
		const { data } = await axios.get(`/api/sales/simplified-search?${searchParams.toString()}`);

		return data.data as TSalesSimplifiedSearchResult;
	} catch (error) {
		console.log("Error running fetchSalesSimplifiedSearch");
		throw error;
	}
}

async function fetchOpenQuotes(clientId: string | null) {
	const searchParams = new URLSearchParams();
	// Sem `clientId` a rota devolve a fila da organização inteira.
	if (clientId) searchParams.set("clientId", clientId);
	const query = searchParams.toString();
	const { data } = await axios.get<TGetQuotesOutput>(`/api/sales/quotes${query ? `?${query}` : ""}`);
	return {
		...data.data,
		// A rota devolve `Date`, o transporte entrega string: reidratar aqui evita que cada consumidor
		// faça `new Date()` sobre um campo tipado como Date.
		orcamentos: data.data.orcamentos.map((orcamento) => ({
			...orcamento,
			criadoEm: orcamento.criadoEm ? new Date(orcamento.criadoEm) : null,
		})),
	};
}

export type TClientOpenQuotes = Awaited<ReturnType<typeof fetchOpenQuotes>>;
export type TClientOpenQuote = TClientOpenQuotes["orcamentos"][number];

export function getClientOpenQuotesQueryKey(clientId: string | null) {
	return ["client-open-quotes", clientId] as const;
}

/**
 * Orçamentos em aberto do cliente. Alimenta a pill do header e o bloco do painel de contexto, então
 * o `staleTime` é curto: um orçamento criado pelo agente precisa aparecer no atendimento em curso.
 */
export function useClientOpenQuotes({ clientId, enabled = true }: { clientId: string | null; enabled?: boolean }) {
	const queryKey = getClientOpenQuotesQueryKey(clientId);
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchOpenQuotes(clientId),
			enabled: enabled && !!clientId,
			staleTime: 30 * 1000,
		}),
		queryKey,
	};
}

export function getOrganizationOpenQuotesQueryKey() {
	return ["organization-open-quotes"] as const;
}

/**
 * Fila de orçamentos em aberto da organização. Alimenta a pill do PDV, onde o orçamento pendente
 * concorre com a venda em curso: `staleTime` curto porque um orçamento criado no atendimento ou
 * pelo agente precisa aparecer para quem está no balcão.
 */
export function useOrganizationOpenQuotes({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = getOrganizationOpenQuotesQueryKey();
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchOpenQuotes(null),
			enabled,
			staleTime: 30 * 1000,
		}),
		queryKey,
	};
}

export function useSalesSimplifiedSearch() {
	const [params, setParams] = useState<TSalesSimplifiedSearchQueryParams>({
		search: "",
		page: 1,
	});
	function updateParams(newParams: Partial<TSalesSimplifiedSearchQueryParams>) {
		setParams((prev) => ({ ...prev, ...newParams }));
	}
	return {
		...useQuery({
			queryKey: ["sales-simplified-search", params],
			queryFn: async () => await fetchSalesSimplifiedSearch(params),
			refetchOnWindowFocus: false,
		}),
		params,
		updateParams,
	};
}

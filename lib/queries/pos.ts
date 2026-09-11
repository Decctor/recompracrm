import type { TGetSaleForEditOutput } from "@/app/api/pos/sales/edit/route";
import type { TGetSaleDraftOutput } from "@/app/api/pos/sales/route";
import type { TGetPOSGroupsOutput } from "@/app/api/pos/groups/route";
import type { TGetPOSProductsInput, TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import type { TGetPOSTopProductsOutput } from "@/app/api/pos/top-products/route";
import type { TGetCrossSellOutput } from "@/app/api/pos/cross-sell/route";
import type { TGetPOSFinancialAccountsOutput } from "@/app/api/pos/financial-accounts/route";
import { POS_PRODUCT_ORDERING_DEFAULT } from "@/schemas/enums";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import axios from "axios";
import { useMemo, useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

// Fetch POS products
async function fetchPOSProducts(input: TGetPOSProductsInput) {
	try {
		const searchParams = new URLSearchParams();
		if (input.page) searchParams.set("page", input.page.toString());
		if (input.search) searchParams.set("search", input.search);
		if (input.group) searchParams.set("group", input.group);
		if (input.channel) searchParams.set("channel", input.channel);
		if (input.ordering) searchParams.set("ordering", input.ordering);

		const { data } = await axios.get<TGetPOSProductsOutput>(`/api/pos/products?${searchParams.toString()}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPOSProducts", error);
		throw error;
	}
}

type UsePOSProductsParams = {
	initialFilters?: Partial<TGetPOSProductsInput>;
};

export function usePOSProducts({ initialFilters }: UsePOSProductsParams = {}) {
	const [filters, setFilters] = useState<TGetPOSProductsInput>({
		page: initialFilters?.page || 1,
		search: initialFilters?.search || "",
		group: initialFilters?.group || null,
		channel: initialFilters?.channel || "POS",
		// Padrão do PDV: o que mais fatura na frente, para o operador achar o corriqueiro sem buscar.
		ordering: initialFilters?.ordering || POS_PRODUCT_ORDERING_DEFAULT,
	});

	const updateFilters = useCallback((newParams: Partial<TGetPOSProductsInput>) => {
		setFilters((prevFilters) => ({ ...prevFilters, ...newParams, page: newParams.page ?? 1 }));
	}, []);

	const debouncedFilters = useDebounceMemo(filters, 300);

	return {
		...useQuery({
			queryKey: ["pos-products", debouncedFilters],
			queryFn: () => fetchPOSProducts(debouncedFilters),
			// Mantém a grade anterior visível durante busca/paginação (evita desmontar para o loader a cada tecla).
			placeholderData: keepPreviousData,
		}),
		queryKey: ["pos-products", debouncedFilters],
		filters,
		updateFilters,
	};
}

// ============================================================================
// Top products ("mais pedidos") — faixa de acesso rápido do PDV
// ============================================================================

async function fetchPOSTopProducts(channel: "POS" | "COMANDA") {
	const { data } = await axios.get<TGetPOSTopProductsOutput>(`/api/pos/top-products?channel=${channel}`);
	return data.data;
}

export function usePOSTopProducts({ channel = "POS" }: { channel?: "POS" | "COMANDA" } = {}) {
	const queryKey = ["pos-top-products", channel];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchPOSTopProducts(channel),
			// O ranking de 90 dias não muda venda a venda; evita refetch a cada montagem do PDV.
			staleTime: 5 * 60 * 1000,
		}),
		queryKey,
	};
}

// Fetch POS groups
async function fetchPOSGroups(channel: "POS" | "COMANDA") {
	try {
		const { data } = await axios.get<TGetPOSGroupsOutput>(`/api/pos/groups?channel=${channel}`);
		return data.data;
	} catch (error) {
		console.log("Error running fetchPOSGroups", error);
		throw error;
	}
}

/**
 * Categorias com produto vendável no canal. O canal entra na chave porque a lista é derivada da
 * vitrine dele: a barra do PDV e a do composer de comanda não são a mesma lista.
 */
export function usePOSGroups({ channel = "POS" }: { channel?: "POS" | "COMANDA" } = {}) {
	return useQuery({
		queryKey: ["pos-groups", channel],
		queryFn: () => fetchPOSGroups(channel),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// ============================================================================
// Fetch POS sale draft by ID (for checkout page)
// ============================================================================

async function fetchSaleDraft(saleId: string) {
	const { data } = await axios.get<TGetSaleDraftOutput>(`/api/pos/sales?id=${saleId}`);
	const result = data.data.sale;
	if (!result) throw new Error("Rascunho de venda não encontrado.");
	// A precificação viaja junto: o checkout precisa saber se os preços congelados ainda valem antes
	// de deixar confirmar, e a comparação com o catálogo é server-side.
	return { sale: result, pricing: data.data.pricing };
}

export function useSaleDraft({ saleId }: { saleId: string }) {
	const queryKey = ["pos-sale-draft", saleId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchSaleDraft(saleId),
			enabled: !!saleId,
		}),
		queryKey,
	};
}

// ============================================================================
// Venda confirmada para edição (superfície de edição do POS)
// ============================================================================

async function fetchSaleForEdit(saleId: string) {
	const { data } = await axios.get<TGetSaleForEditOutput>(`/api/pos/sales/edit?saleId=${saleId}`);
	return data.data;
}

export function useSaleForEdit({ saleId }: { saleId: string }) {
	const queryKey = ["pos-sale-for-edit", saleId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchSaleForEdit(saleId),
			enabled: !!saleId,
		}),
		queryKey,
	};
}

// ============================================================================
// Cross-sell suggestions (client profile + current basket co-occurrence)
// ============================================================================

async function fetchCrossSellProducts({ clientId, basketKey }: { clientId: string; basketKey: string }) {
	const searchParams = new URLSearchParams();
	searchParams.set("clientId", clientId);
	if (basketKey) searchParams.set("basketProductIds", basketKey);
	const { data } = await axios.get<TGetCrossSellOutput>(`/api/pos/cross-sell?${searchParams.toString()}`);
	return data.data;
}

export function usePOSCrossSellProducts({ clientId, basketProductIds }: { clientId: string | null | undefined; basketProductIds: string[] }) {
	// Stable key: ordered + deduped, so changing item quantity/order never refetches —
	// only a product entering or leaving the basket does.
	const basketKey = useMemo(() => [...new Set(basketProductIds)].sort().join(","), [basketProductIds]);
	// Debounce so rapid cart edits don't fire a request per click.
	const { key: debouncedBasketKey } = useDebounceMemo({ key: basketKey }, 600);

	const queryKey = ["pos-cross-sell", clientId, debouncedBasketKey];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchCrossSellProducts({ clientId: clientId as string, basketKey: debouncedBasketKey }),
			enabled: !!clientId,
			placeholderData: keepPreviousData, // keep prior suggestions visible while refetching
			staleTime: 60 * 1000,
		}),
		queryKey,
	};
}

// ============================================================================
// Contas financeiras ofertáveis nas telas de operação (fechamento de conta, expedição)
// ============================================================================

async function fetchPOSFinancialAccounts() {
	const { data } = await axios.get<TGetPOSFinancialAccountsOutput>("/api/pos/financial-accounts");
	return data.data;
}

export function usePOSFinancialAccounts() {
	const queryKey = ["pos-financial-accounts"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchPOSFinancialAccounts,
			// Contas e configuração de métodos mudam em Configurações, não durante o atendimento.
			staleTime: 5 * 60 * 1000,
		}),
		queryKey,
	};
}

import type { TGetIfoodCategoriesOutput } from "@/app/api/integrations/ifood/catalog/categories/route";
import type { TGetIfoodItemOutput } from "@/app/api/integrations/ifood/catalog/items/route";
import type { TGetIfoodInventoryOutput } from "@/app/api/integrations/ifood/catalog/inventory/route";
import type { TGetIfoodBatchOutput } from "@/app/api/integrations/ifood/catalog/products/batch/route";
import type { TGetIfoodOptionGroupsOutput } from "@/app/api/integrations/ifood/catalog/option-groups/route";
import type { TGetIfoodProductsOutput } from "@/app/api/integrations/ifood/catalog/products/route";
import type { TGetIfoodCatalogsOutput } from "@/app/api/integrations/ifood/catalog/route";
import type { TGetIfoodInterruptionsOutput } from "@/app/api/integrations/ifood/merchants/interruptions/route";
import type { TGetIfoodOpeningHoursOutput } from "@/app/api/integrations/ifood/merchants/opening-hours/route";
import type { TGetIfoodMerchantsOutput } from "@/app/api/integrations/ifood/merchants/route";
import type { TGetIfoodMerchantStatusOutput } from "@/app/api/integrations/ifood/merchants/status/route";
import type { TGetIfoodOrderDetailsOutput } from "@/app/api/integrations/ifood/orders/details/route";
import type { TGetIfoodOrdersOutput } from "@/app/api/integrations/ifood/orders/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";

/**
 * Queries da GESTÃO do iFood. Erros 404 dessas rotas significam "iFood não conectado" — a UI usa
 * isso para renderizar o gate de conexão (IfoodConnectionGate).
 */

async function fetchIfoodMerchants() {
	const { data } = await axios.get<TGetIfoodMerchantsOutput>("/api/integrations/ifood/merchants");
	const result = data.data.default;
	if (!result) throw new Error("Lojas do iFood não encontradas.");
	return result;
}

/**
 * Nome por merchantId, para rotular os canais iFood do registro (`sales_channels.refExterno`).
 * Só consulta quando há canal iFood a rotular; sem resposta, os chamadores caem no id.
 */
export function useIfoodMerchantNames({ enabled }: { enabled: boolean }) {
	const { data } = useIfoodMerchants({ enabled });
	return useMemo(() => new Map((data ?? []).map((merchant) => [merchant.id, merchant.nome ?? merchant.razaoSocial ?? merchant.id])), [data]);
}

export function useIfoodMerchants({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["ifood-merchants"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchIfoodMerchants,
			enabled,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodMerchantDetails(merchantId: string) {
	const { data } = await axios.get<TGetIfoodMerchantsOutput>(`/api/integrations/ifood/merchants?merchantId=${merchantId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Detalhes da loja do iFood não encontrados.");
	return result;
}

export function useIfoodMerchantDetails({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["ifood-merchant-details", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodMerchantDetails(merchantId as string),
			enabled: !!merchantId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodMerchantStatus(merchantId: string) {
	const { data } = await axios.get<TGetIfoodMerchantStatusOutput>(`/api/integrations/ifood/merchants/status?merchantId=${merchantId}`);
	return data.data.operacoes;
}

export function useIfoodMerchantStatus({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["ifood-merchant-status", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodMerchantStatus(merchantId as string),
			enabled: !!merchantId,
			retry: false,
			refetchInterval: 60 * 1000,
		}),
		queryKey,
	};
}

async function fetchIfoodInterruptions(merchantId: string) {
	const { data } = await axios.get<TGetIfoodInterruptionsOutput>(`/api/integrations/ifood/merchants/interruptions?merchantId=${merchantId}`);
	return data.data.interrupcoes;
}

export function useIfoodInterruptions({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["ifood-interruptions", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodInterruptions(merchantId as string),
			enabled: !!merchantId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodCatalogs(merchantId: string) {
	const { data } = await axios.get<TGetIfoodCatalogsOutput>(`/api/integrations/ifood/catalog?merchantId=${merchantId}`);
	return data.data;
}

export function useIfoodCatalogs({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["ifood-catalogs", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodCatalogs(merchantId as string),
			enabled: !!merchantId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodCategories({ merchantId, catalogId }: { merchantId: string; catalogId: string }) {
	const { data } = await axios.get<TGetIfoodCategoriesOutput>(
		`/api/integrations/ifood/catalog/categories?merchantId=${merchantId}&catalogId=${catalogId}`,
	);
	return data.data.categorias;
}

export function useIfoodCategories({ merchantId, catalogId }: { merchantId: string | null; catalogId: string | null }) {
	const queryKey = ["ifood-categories", merchantId, catalogId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodCategories({ merchantId: merchantId as string, catalogId: catalogId as string }),
			enabled: !!merchantId && !!catalogId,
			retry: false,
		}),
		queryKey,
	};
}

/**
 * Estado de um lote. Não é hook de propósito: o acompanhamento é imperativo, disparado logo após o
 * envio, e a quantidade de lotes varia por aplicação (preço e status viajam separados).
 */
export async function fetchIfoodBatchStatus({ merchantId, batchId }: { merchantId: string; batchId: string }) {
	const { data } = await axios.get<TGetIfoodBatchOutput>(`/api/integrations/ifood/catalog/products/batch?merchantId=${merchantId}&batchId=${batchId}`);
	return data.data;
}

async function fetchIfoodInventory({ merchantId, produtoId }: { merchantId: string; produtoId: string }) {
	const { data } = await axios.get<TGetIfoodInventoryOutput>(
		`/api/integrations/ifood/catalog/inventory?merchantId=${merchantId}&produtoId=${produtoId}`,
	);
	return data.data;
}

export function useIfoodInventory({ merchantId, produtoId }: { merchantId: string | null; produtoId: string | null }) {
	const queryKey = ["ifood-inventory", merchantId, produtoId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodInventory({ merchantId: merchantId as string, produtoId: produtoId as string }),
			enabled: !!merchantId && !!produtoId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodItemById({ merchantId, itemId }: { merchantId: string; itemId: string }) {
	const { data } = await axios.get<TGetIfoodItemOutput>(`/api/integrations/ifood/catalog/items?merchantId=${merchantId}&itemId=${itemId}`);
	return data.data.byId;
}

/** Item completo com complementos. É a única leitura que traz os grupos — a listagem não traz. */
export function useIfoodItemById({ merchantId, itemId }: { merchantId: string | null; itemId: string | null }) {
	const queryKey = ["ifood-item-by-id", merchantId, itemId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodItemById({ merchantId: merchantId as string, itemId: itemId as string }),
			enabled: !!merchantId && !!itemId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodProducts({ merchantId, page }: { merchantId: string; page: number }) {
	const { data } = await axios.get<TGetIfoodProductsOutput>(`/api/integrations/ifood/catalog/products?merchantId=${merchantId}&page=${page}`);
	return data.data;
}

export function useIfoodProducts({ merchantId, page }: { merchantId: string | null; page: number }) {
	const queryKey = ["ifood-products", merchantId, page];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodProducts({ merchantId: merchantId as string, page }),
			enabled: !!merchantId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodOptionGroups(merchantId: string) {
	const { data } = await axios.get<TGetIfoodOptionGroupsOutput>(`/api/integrations/ifood/catalog/option-groups?merchantId=${merchantId}`);
	const result = data.data.default;
	if (!result) throw new Error("Grupos de complementos não encontrados.");
	return result;
}

export function useIfoodOptionGroups({ merchantId, enabled = true }: { merchantId: string | null; enabled?: boolean }) {
	const queryKey = ["ifood-option-groups", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodOptionGroups(merchantId as string),
			enabled: !!merchantId && enabled,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodOrders() {
	const { data } = await axios.get<TGetIfoodOrdersOutput>("/api/integrations/ifood/orders");
	return data.data.orders;
}

export function useIfoodOrders({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["ifood-orders"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchIfoodOrders,
			enabled,
			retry: false,
			// O painel de pedidos é operacional: mantém a lista fresca enquanto aberto.
			refetchInterval: 30 * 1000,
		}),
		queryKey,
	};
}

async function fetchIfoodOrderDetails(orderId: string) {
	const { data } = await axios.get<TGetIfoodOrderDetailsOutput>(`/api/integrations/ifood/orders/details?orderId=${orderId}`);
	return data.data;
}

export function useIfoodOrderDetails({ orderId }: { orderId: string | null }) {
	const queryKey = ["ifood-order-details", orderId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodOrderDetails(orderId as string),
			enabled: !!orderId,
			retry: false,
		}),
		queryKey,
	};
}

async function fetchIfoodOpeningHours(merchantId: string) {
	const { data } = await axios.get<TGetIfoodOpeningHoursOutput>(`/api/integrations/ifood/merchants/opening-hours?merchantId=${merchantId}`);
	return data.data.turnos;
}

export function useIfoodOpeningHours({ merchantId }: { merchantId: string | null }) {
	const queryKey = ["ifood-opening-hours", merchantId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchIfoodOpeningHours(merchantId as string),
			enabled: !!merchantId,
			retry: false,
		}),
		queryKey,
	};
}

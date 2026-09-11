import type { TGetFulfillmentOrderConfirmationOutput } from "@/app/api/sales/fulfillment/order-confirmation/route";
import type { TGetSalesFulfillmentOutput } from "@/app/api/sales/fulfillment/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export const SALES_FULFILLMENT_QUERY_KEY = ["sales-fulfillment"] as const;

async function fetchSalesFulfillment() {
	const { data } = await axios.get<TGetSalesFulfillmentOutput>("/api/sales/fulfillment");
	if (!data.data.default) throw new Error("Atendimento de vendas não encontrado.");
	return data.data.default;
}

const AUTO_REFRESH_INTERVAL_MS = 30_000;

/**
 * Auto-refresh inteligente: o intervalo e o refetch no foco sao PAUSADOS quando ha um movimento
 * otimista em andamento ou a confirmacao de entrega esta aberta (`paused`), para nao sobrescrever
 * o estado local do quadro. Quando ocioso, reconcilia sozinho a cada 30s e ao focar a aba.
 */
export function useSalesFulfillment({ paused = false, enabled = true }: { paused?: boolean; enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: SALES_FULFILLMENT_QUERY_KEY,
			queryFn: fetchSalesFulfillment,
			enabled,
			refetchInterval: paused ? false : AUTO_REFRESH_INTERVAL_MS,
			refetchIntervalInBackground: false,
			refetchOnWindowFocus: paused ? false : true,
		}),
		queryKey: SALES_FULFILLMENT_QUERY_KEY,
	};
}

async function fetchSalesFulfillmentById(saleId: string) {
	const searchParams = new URLSearchParams({ id: saleId });
	const { data } = await axios.get<TGetSalesFulfillmentOutput>(`/api/sales/fulfillment?${searchParams.toString()}`);
	if (!data.data.byId) throw new Error("Detalhes operacionais da venda não encontrados.");
	return data.data.byId;
}

export function useSalesFulfillmentById({ saleId }: { saleId: string | null }) {
	const queryKey = ["sales-fulfillment-by-id", saleId] as const;
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchSalesFulfillmentById(saleId as string),
			enabled: Boolean(saleId),
		}),
		queryKey,
	};
}

async function fetchFulfillmentOrderCancellationReasons(saleId: string) {
	const { data } = await axios.get<TGetFulfillmentOrderConfirmationOutput>(`/api/sales/fulfillment/order-confirmation?saleId=${saleId}`);
	return data.data.motivos;
}

/** Motivos de recusa do canal (ex.: iFood) para um pedido da fila de confirmação. */
export function useFulfillmentOrderCancellationReasons({ saleId }: { saleId: string | null }) {
	const queryKey = ["fulfillment-order-cancellation-reasons", saleId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFulfillmentOrderCancellationReasons(saleId as string),
			enabled: !!saleId,
			retry: false,
		}),
		queryKey,
	};
}

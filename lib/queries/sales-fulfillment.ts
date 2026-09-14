import type { TGetFulfillmentOrderConfirmationOutput } from "@/app/api/sales/fulfillment/order-confirmation/route";
import type { TGetSalesFulfillmentPendingOutput } from "@/app/api/sales/fulfillment/pending/route";
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

/**
 * Prefixada pela chave do quadro de proposito: toda invalidacao ja existente de
 * `SALES_FULFILLMENT_QUERY_KEY` (transicoes de etapa, edicao de venda) atinge esta por prefixo e
 * atualiza a badge junto, sem nenhum ponto de invalidacao novo para manter em dia.
 */
export const SALES_FULFILLMENT_PENDING_QUERY_KEY = [...SALES_FULFILLMENT_QUERY_KEY, "pending"] as const;

async function fetchSalesFulfillmentPending() {
	const { data } = await axios.get<TGetSalesFulfillmentPendingOutput>("/api/sales/fulfillment/pending");
	return data.data;
}

const PENDING_REFRESH_INTERVAL_MS = 120_000;

/**
 * Contagem de pedidos em atendimento para a badge da sidebar. Montada em toda pagina do dashboard,
 * entao repolla devagar e nunca com a aba em segundo plano.
 *
 * A badge fica pendurada no item "Vendas", que existe para qualquer organizacao, mas a rota exige
 * ERP + `vendas.visualizar`. Para quem nao tem, o erro e permanente: `retry: false` evita o loop
 * imediato e o intervalo se desliga apos a falha, senao toda organizacao so-CRM ficaria disparando
 * um 403 a cada dois minutos, em toda aba aberta, para sempre.
 */
export function useSalesFulfillmentPending({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: SALES_FULFILLMENT_PENDING_QUERY_KEY,
			queryFn: fetchSalesFulfillmentPending,
			enabled,
			refetchInterval: (query) => (query.state.status === "error" ? false : PENDING_REFRESH_INTERVAL_MS),
			refetchIntervalInBackground: false,
			retry: false,
		}),
		queryKey: SALES_FULFILLMENT_PENDING_QUERY_KEY,
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

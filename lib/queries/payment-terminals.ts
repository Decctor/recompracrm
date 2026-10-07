import type { TGetPaymentTerminalsOutput } from "@/app/api/pos/payment-terminals/route";
import type { TGetSalePaymentAttemptOutput } from "@/app/api/pos/sales/payment-attempt/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export type { TPaymentTerminalListItem } from "@/app/api/pos/payment-terminals/route";
export type { TSalePaymentAttemptView } from "@/app/api/pos/sales/payment-attempt/route";

async function fetchPaymentTerminals() {
	const { data } = await axios.get<TGetPaymentTerminalsOutput>("/api/pos/payment-terminals");
	return data.data.terminals;
}

export function getPaymentTerminalsQueryKey() {
	return ["pos-payment-terminals"] as const;
}

// Maquininhas da organização para o bloco de pagamento. `online` vem do heartbeat (a cada
// minuto), então 30 s de refetch acompanha um terminal que acabou de ligar.
export function usePaymentTerminals({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = getPaymentTerminalsQueryKey();
	return {
		...useQuery({ queryKey, queryFn: fetchPaymentTerminals, enabled, staleTime: 15 * 1000, refetchInterval: enabled ? 30 * 1000 : false }),
		queryKey,
	};
}

async function fetchSalePaymentAttempt(saleId: string) {
	const { data } = await axios.get<TGetSalePaymentAttemptOutput>(`/api/pos/sales/payment-attempt?saleId=${encodeURIComponent(saleId)}`);
	return data.data.bySale;
}

export function getSalePaymentAttemptQueryKey(saleId: string) {
	return ["pos-sale-payment-attempt", saleId] as const;
}

// Acompanhamento da cobrança de uma venda na maquininha. Polling curto enquanto a tentativa está
// aberta; para quando ela encerra (consumida, não aprovada) — o resultado não muda mais.
export function useSalePaymentAttempt({ saleId, enabled = true }: { saleId: string; enabled?: boolean }) {
	const queryKey = getSalePaymentAttemptQueryKey(saleId);
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchSalePaymentAttempt(saleId),
			enabled,
			refetchInterval: (query) => (query.state.data?.attempt?.aberta === false ? false : 3 * 1000),
		}),
		queryKey,
	};
}

async function fetchPendingTerminalCharges() {
	const { data } = await axios.get<TGetSalePaymentAttemptOutput>("/api/pos/sales/payment-attempt");
	return data.data.pending ?? [];
}

export function getPendingTerminalChargesQueryKey() {
	return ["pos-pending-terminal-charges"] as const;
}

// Pendências de cobrança da organização para a pill do PDV: "NOVA VENDA" não bloqueia o operador,
// então a cobrança anterior precisa continuar visível em algum lugar enquanto o cliente paga.
export function usePendingTerminalCharges({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = getPendingTerminalChargesQueryKey();
	return {
		...useQuery({ queryKey, queryFn: fetchPendingTerminalCharges, enabled, staleTime: 10 * 1000, refetchInterval: enabled ? 15 * 1000 : false }),
		queryKey,
	};
}

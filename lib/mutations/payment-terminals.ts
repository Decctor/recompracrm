import type { TSalePaymentAttemptActionInput, TSalePaymentAttemptActionOutput } from "@/app/api/pos/sales/payment-attempt/route";
import axios from "axios";

export async function cancelSalePaymentAttempt({ saleId }: { saleId: string }) {
	const { data } = await axios.post<TSalePaymentAttemptActionOutput>("/api/pos/sales/payment-attempt", { saleId, action: "CANCELAR" } satisfies TSalePaymentAttemptActionInput);
	return data;
}

export async function reassignSalePaymentAttempt({ saleId, dispositivoId }: { saleId: string; dispositivoId: string }) {
	const { data } = await axios.post<TSalePaymentAttemptActionOutput>("/api/pos/sales/payment-attempt", {
		saleId,
		action: "REATRIBUIR",
		dispositivoId,
	} satisfies TSalePaymentAttemptActionInput);
	return data;
}

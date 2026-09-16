import type {
	TCreatePointOfInteractionTransactionInput,
	TCreatePointOfInteractionTransactionOutput,
} from "@/app/api/point-of-interaction/new-transaction/route";
import type { TPostFulfillmentDisputeResponseInput, TPostFulfillmentDisputeResponseOutput } from "@/app/api/sales/fulfillment/dispute-response/route";
import type {
	TPostFulfillmentOrderConfirmationInput,
	TPostFulfillmentOrderConfirmationOutput,
} from "@/app/api/sales/fulfillment/order-confirmation/route";
import type { TPatchSalesFulfillmentInput, TPatchSalesFulfillmentOutput } from "@/app/api/sales/fulfillment/route";
import type { TReassignSaleClientInput, TReassignSaleClientOutput } from "@/app/api/sales/client/route";
import type { TCreateQuoteInput, TCreateQuoteOutput } from "@/app/api/sales/quotes/route";
import type { TUpdateSaleAttendanceStatusInput, TUpdateSaleAttendanceStatusOutput } from "@/app/api/pos/sales/attendance-status/route";
import type { TCreateSaleInput, TCreateSaleOutput, TDeleteSaleOutput } from "@/app/api/sales/route";
import type { TBulkCreateSalesInput, TBulkCreateSalesOutput, TBulkSalesMapInput, TBulkSalesMapOutput } from "@/state-hooks/use-bulk-create-sales";
import axios from "axios";

export async function patchSalesFulfillment(input: TPatchSalesFulfillmentInput) {
	const { data } = await axios.patch<TPatchSalesFulfillmentOutput>("/api/sales/fulfillment", input);
	return data;
}

export async function updateSaleAttendanceStatus(input: TUpdateSaleAttendanceStatusInput) {
	const { data } = await axios.post<TUpdateSaleAttendanceStatusOutput>("/api/pos/sales/attendance-status", input);
	return data;
}

export async function postFulfillmentOrderConfirmation(input: TPostFulfillmentOrderConfirmationInput) {
	const { data } = await axios.post<TPostFulfillmentOrderConfirmationOutput>("/api/sales/fulfillment/order-confirmation", input);
	return data;
}

export async function postFulfillmentDisputeResponse(input: TPostFulfillmentDisputeResponseInput) {
	const { data } = await axios.post<TPostFulfillmentDisputeResponseOutput>("/api/sales/fulfillment/dispute-response", input);
	return data;
}

export async function createSale(input: TCreateSaleInput) {
	try {
		// Client side checkings
		if (!input.orgId) {
			throw new Error("ID da organização não informado.");
		}
		if (!input.clientId) {
			throw new Error("Cliente não informado.");
		}
		if (!input.saleValue) {
			throw new Error("Valor total não informado.");
		}
		if (!input.password) {
			throw new Error("Senha do operador não informada.");
		}
		const { data } = await axios.post<TCreateSaleOutput>("/api/sales", input);
		return data;
	} catch (error) {
		console.log("Error running createSale", error);
		throw error;
	}
}

export async function createPointOfInteractionSale(input: TCreatePointOfInteractionTransactionInput) {
	try {
		// Client side checkings
		if (!input.orgId) {
			throw new Error("ID da organização não informado.");
		}
		if (!input.client.telefone) {
			throw new Error("Telefone do cliente não informado.");
		}
		if (!input.client.nome && !input.client.id) {
			throw new Error("Cliente não informado.");
		}
		if (!input.sale.valor || input.sale.valor <= 0) {
			throw new Error("Valor da venda deve ser positivo.");
		}
		if (!input.operatorIdentifier) {
			throw new Error("Identificador do operador não informado.");
		}
		const { data } = await axios.post<TCreatePointOfInteractionTransactionOutput>("/api/point-of-interaction/new-transaction", input);
		return data;
	} catch (error) {
		console.log("Error running createPointOfInteractionSale", error);
		throw error;
	}
}

export async function suggestSalesSheetMapping(input: TBulkSalesMapInput) {
	const { data } = await axios.post<{
		data: TBulkSalesMapOutput;
		message: string;
	}>("/api/sales/bulk/map", input);
	return data;
}

export async function bulkCreateSales(input: TBulkCreateSalesInput, onUploadProgress?: (progress: number) => void) {
	const { data } = await axios.post<TBulkCreateSalesOutput>("/api/sales/bulk", input, {
		onUploadProgress: (progressEvent) => onUploadProgress?.(Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1))),
	});
	return data;
}

export async function createQuote(input: TCreateQuoteInput) {
	const { data } = await axios.post<TCreateQuoteOutput>("/api/sales/quotes", input);
	return data;
}

// Define, troca ou desvincula (clienteId null) o cliente de uma venda confirmada.
export async function reassignSaleClient(input: TReassignSaleClientInput) {
	const { data } = await axios.patch<TReassignSaleClientOutput>("/api/sales/client", input);
	return data;
}

export async function deleteSale({ id }: { id: string }) {
	const searchParams = new URLSearchParams();
	searchParams.set("id", id);
	const { data } = await axios.delete<TDeleteSaleOutput>(`/api/sales?${searchParams.toString()}`);
	return data;
}

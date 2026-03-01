import type { TCreateSaleDraftInput, TCreateSaleDraftOutput } from "@/app/api/pos/sales/route";
import type { TUpdateSaleDraftInput, TUpdateSaleDraftOutput } from "@/app/api/pos/sales/route";
import type { TConfirmSaleInput, TConfirmSaleOutput } from "@/app/api/pos/sales/confirm/route";
import axios from "axios";

export async function createSaleDraft(input: TCreateSaleDraftInput) {
	const { data } = await axios.post<TCreateSaleDraftOutput>("/api/pos/sales", input);
	return data;
}

export async function updateSaleDraft(input: TUpdateSaleDraftInput) {
	const { data } = await axios.put<TUpdateSaleDraftOutput>(`/api/pos/sales?id=${input.id}`, input);
	return data;
}

export async function confirmSale(input: TConfirmSaleInput) {
	const { data } = await axios.post<TConfirmSaleOutput>(`/api/pos/sales/confirm?id=${input.id}`, input);
	return data;
}

export async function cancelSaleDraft(saleId: string) {
	const { data } = await axios.post(`/api/pos/sales/cancel?id=${saleId}`);
	return data;
}

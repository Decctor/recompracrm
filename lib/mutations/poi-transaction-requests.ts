import type {
	TCreatePoiTransactionRequestInput,
	TCreatePoiTransactionRequestOutput,
} from "@/app/api/point-of-interaction/transaction-requests/public/route";
import type {
	TRejectPoiTransactionRequestInput,
	TRejectPoiTransactionRequestOutput,
} from "@/app/api/point-of-interaction/transaction-requests/management/reject/route";
import type {
	TApprovePoiTransactionRequestInput,
	TApprovePoiTransactionRequestOutput,
} from "@/app/api/point-of-interaction/transaction-requests/management/approve/route";
import axios from "axios";

export async function createPoiTransactionRequest(input: TCreatePoiTransactionRequestInput) {
	const { data } = await axios.post<TCreatePoiTransactionRequestOutput>("/api/point-of-interaction/transaction-requests/public", input);
	return data;
}

export async function approvePoiTransactionRequest(input: TApprovePoiTransactionRequestInput) {
	const { data } = await axios.post<TApprovePoiTransactionRequestOutput>("/api/point-of-interaction/transaction-requests/management/approve", input);
	return data;
}

export async function rejectPoiTransactionRequest(input: TRejectPoiTransactionRequestInput) {
	const { data } = await axios.post<TRejectPoiTransactionRequestOutput>("/api/point-of-interaction/transaction-requests/management/reject", input);
	return data;
}

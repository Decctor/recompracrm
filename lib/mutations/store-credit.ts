import axios from "axios";
import type { TUpdateClientStoreCreditInput, TUpdateClientStoreCreditOutput } from "@/app/api/clients/store-credit/route";
import type { TUpdateStoreCreditPolicyInput, TUpdateStoreCreditPolicyOutput } from "@/app/api/finances/store-credit/policy/route";
import type { TReceiveStoreCreditOutput, TReceiveStoreCreditPayload } from "@/app/api/finances/store-credit/receive/route";

export async function receiveStoreCredit(input: TReceiveStoreCreditPayload) {
	const { data } = await axios.post<TReceiveStoreCreditOutput>("/api/finances/store-credit/receive", input);
	return data;
}

export async function updateClientStoreCredit(input: TUpdateClientStoreCreditInput) {
	const { data } = await axios.put<TUpdateClientStoreCreditOutput>("/api/clients/store-credit", input);
	return data;
}

export async function updateStoreCreditPolicy(input: TUpdateStoreCreditPolicyInput) {
	const { data } = await axios.put<TUpdateStoreCreditPolicyOutput>("/api/finances/store-credit/policy", input);
	return data;
}

import axios from "axios";
import type { TReceiveStoreCreditOutput, TReceiveStoreCreditPayload } from "@/app/api/finances/store-credit/receive/route";

export async function receiveStoreCredit(input: TReceiveStoreCreditPayload) {
	const { data } = await axios.post<TReceiveStoreCreditOutput>("/api/finances/store-credit/receive", input);
	return data;
}

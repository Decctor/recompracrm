import type { TSyncWhatsappContactsOutput } from "@/app/api/whatsapp-connections/contacts-sync/route";
import type { TClearPhoneSendBlockInput, TClearPhoneSendBlockOutput } from "@/app/api/whatsapp-connections/send-block/route";
import type { TSyncWhatsappMessageHistoryOutput } from "@/app/api/whatsapp-connections/message-history-sync/route";
import type {
	TDeleteWhatsappConnectionOutput,
	TUpdateConnectionPhoneAiServiceInput,
	TUpdateConnectionPhoneAiServiceOutput,
} from "@/app/api/whatsapp-connections/route";
import axios from "axios";

export async function syncWhatsappContacts(phoneId: string) {
	const params = new URLSearchParams({ phoneId });
	const { data } = await axios.post<TSyncWhatsappContactsOutput>(`/api/whatsapp-connections/contacts-sync?${params.toString()}`);
	return data;
}
export async function syncWhatsappMessageHistory(phoneId: string) {
	const params = new URLSearchParams({ phoneId });
	const { data } = await axios.post<TSyncWhatsappMessageHistoryOutput>(`/api/whatsapp-connections/message-history-sync?${params.toString()}`);
	return data;
}
export async function clearPhoneSendBlock(input: TClearPhoneSendBlockInput) {
	const params = new URLSearchParams({ phoneId: input.phoneId });
	const { data } = await axios.delete<TClearPhoneSendBlockOutput>(`/api/whatsapp-connections/send-block?${params.toString()}`);
	return data;
}
export async function deleteWhatsappConnection(input: string) {
	const { data } = await axios.delete<TDeleteWhatsappConnectionOutput>(`/api/whatsapp-connections?id=${input}`);
	return data;
}
export async function updateConnectionPhoneAiService(input: TUpdateConnectionPhoneAiServiceInput) {
	const { data } = await axios.patch<TUpdateConnectionPhoneAiServiceOutput>("/api/whatsapp-connections", input);
	return data;
}

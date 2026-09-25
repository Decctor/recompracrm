import type { TUpdateChatAssignmentInput, TUpdateChatAssignmentOutput } from "@/app/api/chats/assignments/route";
import type { TDeleteChatFollowUpInput, TDeleteChatFollowUpOutput } from "@/app/api/chats/follow-ups/route";
import type { TRetryChatMessageInput, TRetryChatMessageOutput } from "@/app/api/chats/messages/retry/route";
import type { TCreateChatMessageInput, TCreateChatMessageOutput } from "@/app/api/chats/messages/route";
import type { TCreateChatInput, TCreateChatOutput, TUpdateChatInput, TUpdateChatOutput } from "@/app/api/chats/route";
import axios from "axios";

// Wrappers Axios puros: a lógica de React Query (invalidação, otimismo, toasts) vive no
// componente que dispara a mutação, conforme a convenção do CLAUDE.md. A versão anterior
// deste arquivo carregava hooks `useMutation` e chegava a orquestrar dois requests em
// sequência (persistir + enviar) — o envio agora é atômico na rota.

export async function createChat(input: TCreateChatInput) {
	const { data } = await axios.post<TCreateChatOutput>("/api/chats", input);
	return data;
}

export async function markChatRead(input: { chatId: string }) {
	const payload: TUpdateChatInput = { acao: "mark_as_read", chatId: input.chatId };
	const { data } = await axios.patch<TUpdateChatOutput>("/api/chats", payload);
	return data;
}

export async function sendChatMessage(input: TCreateChatMessageInput) {
	const { data } = await axios.post<TCreateChatMessageOutput>("/api/chats/messages", input);
	return data;
}

export async function retryChatMessage(input: TRetryChatMessageInput) {
	const { data } = await axios.post<TRetryChatMessageOutput>("/api/chats/messages/retry", input);
	return data;
}

export async function updateChatAssignment(input: TUpdateChatAssignmentInput) {
	const { data } = await axios.patch<TUpdateChatAssignmentOutput>("/api/chats/assignments", input);
	return data;
}

export async function cancelChatFollowUp(input: TDeleteChatFollowUpInput) {
	const { data } = await axios.delete<TDeleteChatFollowUpOutput>(`/api/chats/follow-ups?id=${input.id}`);
	return data;
}

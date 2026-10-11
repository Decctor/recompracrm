import type { TGetChatTemplatesOutput } from "@/app/api/chats/templates/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchChatTemplates(chatId: string) {
	const { data } = await axios.get<TGetChatTemplatesOutput>(`/api/chats/templates?chatId=${encodeURIComponent(chatId)}`);
	return data.data.templates;
}

export type TChatTemplate = TGetChatTemplatesOutput["data"]["templates"][number];

/** Templates aprovados para o número do chat — o que o `ChatInputArea` oferece com a janela expirada. */
export function useChatTemplates({ chatId, enabled = true }: { chatId: string | null; enabled?: boolean }) {
	const queryKey = ["chat-templates", chatId] as const;
	return {
		...useQuery({ queryKey, queryFn: () => fetchChatTemplates(chatId ?? ""), enabled: enabled && !!chatId, staleTime: 60_000 }),
		queryKey,
	};
}

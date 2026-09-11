import { appRoutes } from "@/lib/navigation/routes";
import { ChatAssignmentStatusEnum, ChatInboxViewEnum, type TChatAssignmentStatus, type TChatInboxView } from "@/schemas/enums";
import { createSerializer, parseAsArrayOf, parseAsStringEnum } from "nuqs";

/**
 * Visão e status da inbox de chats como estado na URL (nuqs) — o mesmo padrão de
 * `lib/sales/history-url-state.ts`. A URL é a dona do estado; o localStorage da sidebar só a semeia
 * quando ela chega limpa. `buildChatsInboxHref` é o que o dashboard usa para abrir a inbox já
 * filtrada (ex.: conversas aguardando resposta).
 */
export const chatsInboxParsers = {
	view: parseAsStringEnum(ChatInboxViewEnum.options).withDefault("MINHAS"),
	status: parseAsArrayOf(parseAsStringEnum(ChatAssignmentStatusEnum.options)).withDefault([]),
};

export type TChatsInboxUrlState = {
	view: TChatInboxView;
	status: TChatAssignmentStatus[];
};

const serializeChatsInbox = createSerializer(chatsInboxParsers);

/** Link para a inbox de chats com filtros ativos; chaves omitidas ficam no padrão. */
export function buildChatsInboxHref(filters: Partial<TChatsInboxUrlState>) {
	return serializeChatsInbox(appRoutes.channels.whatsapp(), filters);
}

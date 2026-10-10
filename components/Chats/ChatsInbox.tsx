"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { parseAsString, useQueryState } from "nuqs";
import type { TAttendancePermissions } from "./ChatAssignmentActions";
import ChatHub from "./ChatHub";
import type { TQuotePermissions } from "./Quotes/config";

type ChatsInboxProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	attendancePermissions: TAttendancePermissions;
	quotePermissions: TQuotePermissions;
};

/**
 * Caixa de entrada de Conversas. A conversa aberta vive na URL (`?chat=`): é assim que o quadro
 * abre um card aqui (`appRoutes.conversations.chat`) e que um link leva direto a uma conversa.
 * `replace` para que trocar de conversa não empilhe histórico.
 */
export default function ChatsInbox({ user, organizationId, whatsappConnections, attendancePermissions, quotePermissions }: ChatsInboxProps) {
	const [selectedChatId, setSelectedChatId] = useQueryState("chat", parseAsString.withOptions({ history: "replace" }));

	return (
		<div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
			<ChatHub
				user={user}
				organizationId={organizationId}
				whatsappConnections={whatsappConnections}
				selectedChatId={selectedChatId}
				onSelectChat={(chatId) => void setSelectedChatId(chatId)}
				quotePermissions={quotePermissions}
				attendancePermissions={attendancePermissions}
			/>
		</div>
	);
}

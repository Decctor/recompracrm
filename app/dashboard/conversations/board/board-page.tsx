"use client";

import ChatsBoard from "@/components/Chats/Board/ChatsBoard";
import ChatsMain from "@/components/Chats/ChatsMain";
import { appRoutes } from "@/lib/navigation/routes";
import { useRouter } from "next/navigation";
import { conversationsPageClassName } from "../layout-classes";

export default function ConversationsBoardPage({ organizationId }: { organizationId: string }) {
	const router = useRouter();

	return (
		<div className={conversationsPageClassName}>
			<ChatsMain>
				{(whatsappConnections) => (
					// Abrir um card é sempre ir para a caixa de entrada, já na conversa.
					<ChatsBoard
						organizationId={organizationId}
						whatsappConnections={whatsappConnections}
						onOpenChat={(chatId) => router.push(appRoutes.conversations.chat(chatId))}
					/>
				)}
			</ChatsMain>
		</div>
	);
}

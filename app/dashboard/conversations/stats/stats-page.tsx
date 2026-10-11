"use client";

import ChatsMain from "@/components/Chats/ChatsMain";
import ChatsStatsSection from "@/components/Chats/Stats/ChatsStatsSection";

export default function ConversationsStatsPage({ canManageAttendances }: { canManageAttendances: boolean }) {
	return (
		<div className="flex w-full flex-col gap-3">
			<ChatsMain>
				{(whatsappConnections) => <ChatsStatsSection whatsappConnections={whatsappConnections} canManageAttendances={canManageAttendances} />}
			</ChatsMain>
		</div>
	);
}

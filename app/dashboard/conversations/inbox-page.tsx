"use client";

import type { TAttendancePermissions } from "@/components/Chats/ChatAssignmentActions";
import ChatsInbox from "@/components/Chats/ChatsInbox";
import ChatsMain from "@/components/Chats/ChatsMain";
import type { TQuotePermissions } from "@/components/Chats/Quotes/config";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { conversationsPageClassName } from "./layout-classes";

type ConversationsInboxPageProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	attendancePermissions: TAttendancePermissions;
	quotePermissions: TQuotePermissions;
};

export default function ConversationsInboxPage({ user, organizationId, attendancePermissions, quotePermissions }: ConversationsInboxPageProps) {
	return (
		<div className={conversationsPageClassName}>
			<ChatsMain>
				{(whatsappConnections) => (
					<ChatsInbox
						user={user}
						organizationId={organizationId}
						whatsappConnections={whatsappConnections}
						attendancePermissions={attendancePermissions}
						quotePermissions={quotePermissions}
					/>
				)}
			</ChatsMain>
		</div>
	);
}

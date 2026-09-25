"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";
import { ChatSidebar } from "./ChatSidebar";
import { ChatThread } from "./ChatThread";
import type { TQuotePermissions } from "./Quotes/config";

type ChatHubProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	/** Controlado pelo workspace: o quadro também seleciona conversas. */
	selectedChatId: string | null;
	onSelectChat: (chatId: string | null) => void;
	quotePermissions: TQuotePermissions;
};

export default function ChatHub({ user, organizationId, whatsappConnections, selectedChatId, onSelectChat, quotePermissions }: ChatHubProps) {
	const currentUser = { id: user.id, nome: user.nome, avatarUrl: user.avatarUrl };

	return (
		<div className="flex h-full min-h-0 w-full overflow-hidden">
			{/* No mobile, a lista some quando uma conversa está aberta. */}
			<div className={cn("h-full min-h-0 w-full shrink-0 overflow-hidden md:w-80 lg:w-96", selectedChatId && "hidden md:block")}>
				<ChatSidebar
					organizationId={organizationId}
					selectedChatId={selectedChatId}
					onSelectChat={onSelectChat}
					whatsappConnections={whatsappConnections}
				/>
			</div>

			<div className={cn("h-full min-h-0 min-w-0 flex-1 overflow-hidden", !selectedChatId && "hidden md:block")}>
				{selectedChatId ? (
					<ChatThread
						key={selectedChatId}
						chatId={selectedChatId}
						organizationId={organizationId}
						currentUser={currentUser}
						quotePermissions={quotePermissions}
						onBack={() => onSelectChat(null)}
					/>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
						<MessageSquare className="h-8 w-8 opacity-40" />
						<p className="text-sm">Selecione uma conversa para começar.</p>
					</div>
				)}
			</div>
		</div>
	);
}

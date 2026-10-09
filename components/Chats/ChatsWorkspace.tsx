"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import { Tabs, TabsContent, TabsList, TabsTrigger, tabsPageToolbarClassName } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { BarChart3, Columns3, MessagesSquare } from "lucide-react";
import { useCallback, useState } from "react";
import ChatsBoard from "./Board/ChatsBoard";
import type { TAttendancePermissions } from "./ChatAssignmentActions";
import ChatHub from "./ChatHub";
import type { TQuotePermissions } from "./Quotes/config";
import ChatsStatsSection from "./Stats/ChatsStatsSection";

/**
 * Casca das três abas do módulo de atendimentos.
 *
 * A aba é estado desta tela, não dado: não vira enum em `schemas/enums.ts` porque nunca
 * atravessa a API.
 *
 * `selectedChatId` mora aqui, e não dentro do `ChatHub`, porque o quadro precisa abrir uma
 * conversa no hub ao clicar num card — se a seleção vivesse no hub, o quadro seria um beco
 * sem saída.
 */

const WORKSPACE_TABS = ["hub", "quadro", "estatisticas"] as const;
type TChatsWorkspaceTab = (typeof WORKSPACE_TABS)[number];

type ChatsWorkspaceProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	attendancePermissions: TAttendancePermissions;
	quotePermissions: TQuotePermissions;
};

export default function ChatsWorkspace({ user, organizationId, whatsappConnections, attendancePermissions, quotePermissions }: ChatsWorkspaceProps) {
	const [tab, setTab] = useState<TChatsWorkspaceTab>("hub");
	const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

	/** Abrir uma conversa a partir do quadro é sempre um movimento para o hub. */
	const openChatInHub = useCallback((chatId: string) => {
		setSelectedChatId(chatId);
		setTab("hub");
	}, []);

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-3">
			<Tabs value={tab} onValueChange={(value) => setTab(value as TChatsWorkspaceTab)} className="flex min-h-0 w-full flex-1 flex-col">
				<div className={tabsPageToolbarClassName}>
					<TabsList variant="page">
						<TabsTrigger value="hub">
							<MessagesSquare className="h-4 min-h-4 w-4 min-w-4" />
							Hub
						</TabsTrigger>
						<TabsTrigger value="quadro">
							<Columns3 className="h-4 min-h-4 w-4 min-w-4" />
							Quadro
						</TabsTrigger>
						<TabsTrigger value="estatisticas">
							<BarChart3 className="h-4 min-h-4 w-4 min-w-4" />
							Estatísticas
						</TabsTrigger>
					</TabsList>
				</div>

				{/*
				  `forceMount` no hub: sem ele o Radix desmonta a aba inativa, e voltar do quadro
				  remontaria a thread — perdendo o scroll, o rascunho da mensagem e as inscrições
				  de realtime da inbox. O `data-[state=inactive]:hidden` é obrigatório junto: o
				  atributo `hidden` que o Radix aplica é regra do agente de usuário e perde para
				  a classe `flex`.
				*/}
				<TabsContent
					value="hub"
					forceMount
					className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm data-[state=inactive]:hidden"
				>
					<ChatHub
						user={user}
						organizationId={organizationId}
						whatsappConnections={whatsappConnections}
						selectedChatId={selectedChatId}
						onSelectChat={setSelectedChatId}
						quotePermissions={quotePermissions}
						attendancePermissions={attendancePermissions}
					/>
				</TabsContent>

				{/* Quadro e estatísticas montam sob demanda: nenhum dos dois precisa ficar quente. */}
				<TabsContent value="quadro" className="mt-3 flex min-h-0 flex-1 flex-col">
					<ChatsBoard organizationId={organizationId} whatsappConnections={whatsappConnections} onOpenChat={openChatInHub} />
				</TabsContent>

				<TabsContent value="estatisticas" className="mt-3 flex min-h-0 flex-1 flex-col">
					<ChatsStatsSection whatsappConnections={whatsappConnections} canManageAttendances={attendancePermissions.canManage} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

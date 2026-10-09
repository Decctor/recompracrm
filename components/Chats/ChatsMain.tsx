"use client";

import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import ErrorComponent from "../Layouts/ErrorComponent";
import LoadingComponent from "../Layouts/LoadingComponent";
import type { TAttendancePermissions } from "./ChatAssignmentActions";
import ChatsWorkspace from "./ChatsWorkspace";
import type { TQuotePermissions } from "./Quotes/config";

type ChatsMainProps = {
	user: TAuthUserSession["user"];
	organizationId: string;
	/** `canManage` (`atendimentos.finalizar`) também libera o ranking nominal na aba de estatísticas. */
	attendancePermissions: TAttendancePermissions;
	/** Permissões de venda: o hub e o módulo comercial são gateados de forma independente. */
	quotePermissions: TQuotePermissions;
};

export default function ChatsMain({ user, organizationId, attendancePermissions, quotePermissions }: ChatsMainProps) {
	const { data: whatsappConnections, isPending, isError, error } = useWhatsappConnections();

	if (isPending) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (whatsappConnections.length === 0) return <ErrorComponent msg="Conexão do WhatsApp não encontrada." />;

	// As permissões passam a ser aplicadas na API; a UI reage aos 403 e ao estado de posse
	// do atendimento, em vez do antigo `userHasMessageSendingPermission={true}` fixo.
	return (
		<ChatsWorkspace
			user={user}
			organizationId={organizationId}
			whatsappConnections={whatsappConnections}
			attendancePermissions={attendancePermissions}
			quotePermissions={quotePermissions}
		/>
	);
}

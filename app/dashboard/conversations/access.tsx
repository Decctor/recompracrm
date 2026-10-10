import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import type { TAttendancePermissions } from "@/components/Chats/ChatAssignmentActions";
import type { TQuotePermissions } from "@/components/Chats/Quotes/config";
import { requireDashboardCapability } from "@/lib/access/guards";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { redirect } from "next/navigation";

/**
 * Acesso comum às páginas de Conversas: recurso do plano (`whatsapp`, a chave de capability) e
 * permissão `atendimentos.visualizar` do membro. Devolve o elemento de bloqueio ou a membership.
 */
export async function resolveConversationsAccess() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("whatsapp");
	if (unauthorized) return { denied: unauthorized } as const;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.permissoes.atendimentos.visualizar) return { denied: <UnauthorizedPage /> } as const;
	return { denied: null, user: sessionUser.user, membership: sessionUser.membership } as const;
}

export function getAttendancePermissions(membership: NonNullable<TAuthUserSession["membership"]>): TAttendancePermissions {
	return {
		// `responder` é o gate de entrada de quase toda ação da API (assumir, transferir, liberar...).
		canRespond: membership.permissoes.atendimentos.responder ?? false,
		// `finalizar` é "gerir qualquer atendimento" no servidor (`mayManageAssignment`), não só encerrar.
		// Também libera o ranking nominal nas estatísticas.
		canManage: membership.permissoes.atendimentos.finalizar ?? false,
	};
}

export function getQuotePermissions(membership: NonNullable<TAuthUserSession["membership"]>): TQuotePermissions {
	return {
		criar: membership.permissoes.vendas.criar ?? false,
		// Mesmo gate da listagem de vendas para abrir o checkout de um orçamento.
		editar: membership.permissoes.vendas.editar ?? false,
		// Rascunho não tem trilha contábil: quem opera vendas pode descartar.
		cancelar: (membership.permissoes.vendas.criar || membership.permissoes.vendas.excluir) ?? false,
	};
}

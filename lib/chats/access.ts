import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TChatAssignmentEntity } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

/**
 * Autorização do hub de atendimentos.
 *
 * Duas camadas independentes:
 * 1. **Recurso da organização** — `configuracao.recursos.hubAtendimentos.acesso`. Define se
 *    o plano contratado inclui o hub.
 * 2. **Permissão do membro** — `membership.permissoes.atendimentos`. Define o que aquele
 *    usuário pode fazer dentro do hub.
 *
 * Até esta iniciativa nenhuma das duas era aplicada de forma consistente: o `ChatsMain`
 * passava `userHasMessageSendingPermission={true}` fixo e só o envio checava o recurso.
 */

export type TChatPermission = "visualizar" | "iniciar" | "responder" | "receberTransferencias" | "finalizar";

export type TChatAccessContext = {
	organizacaoId: string;
	session: TAuthUserSession;
};

/**
 * Valida sessão + recurso da organização + permissão, e devolve o `organizacaoId` já
 * estreitado para não-nulo. Toda rota do módulo começa por aqui.
 */
export function assertChatAccess({ session, permission }: { session: TAuthUserSession | null; permission: TChatPermission }): TChatAccessContext {
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado.");

	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");

	const hasHubAccess = session.membership?.organizacao.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
	if (!hasHubAccess) throw new createHttpError.Forbidden("Acesso ao hub de atendimentos não está habilitado para esta organização.");

	if (!hasChatPermission({ session, permission })) {
		throw new createHttpError.Forbidden(CHAT_PERMISSION_ERRORS[permission]);
	}

	return { organizacaoId, session };
}

const CHAT_PERMISSION_ERRORS: Record<TChatPermission, string> = {
	visualizar: "Você não possui permissão para visualizar atendimentos.",
	iniciar: "Você não possui permissão para iniciar atendimentos.",
	responder: "Você não possui permissão para responder atendimentos.",
	receberTransferencias: "Você não possui permissão para receber transferências de atendimentos.",
	finalizar: "Você não possui permissão para gerenciar atendimentos.",
};

export function hasChatPermission({ session, permission }: { session: TAuthUserSession; permission: TChatPermission }) {
	const permissoes = session.membership?.permissoes.atendimentos;
	if (!permissoes) return false;
	// `receberTransferencias` é opcional no schema para não invalidar membros antigos cujo
	// JSONB ainda não tem a chave; a ausência é tratada como negativa.
	return permissoes[permission] ?? false;
}

/**
 * Ações sobre um atendimento existente exigem posse **ou** permissão de gestão.
 * Um gestor (`finalizar`) pode agir sobre qualquer atendimento da organização.
 */
export function mayManageAssignment({
	session,
	assignment,
}: {
	session: TAuthUserSession;
	assignment: Pick<TChatAssignmentEntity, "responsavelUsuarioId"> | null | undefined;
}) {
	if (assignment?.responsavelUsuarioId === session.user.id) return true;
	return hasChatPermission({ session, permission: "finalizar" });
}

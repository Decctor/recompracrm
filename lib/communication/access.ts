import type { TAuthUserSession } from "@/lib/authentication/types";
import { hasChatPermission } from "@/lib/chats/access";
import { canEditCampaigns } from "@/lib/permissions/campaigns";
import { canEditCommunication, canPublishCommunication, canViewCommunication } from "@/lib/permissions/communication";
import createHttpError from "http-errors";

/**
 * Guardas das rotas de comunicação (templates de mensagem e kits visuais). Recebem a sessão do route
 * handler e lançam o erro HTTP; a regra de cada permissão (e a semântica de ausência) mora em
 * lib/permissions/communication.ts.
 */
function requireMembershipPermissions(session: TAuthUserSession) {
	const permissoes = session.membership?.permissoes;
	if (!permissoes) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return permissoes;
}

export const COMMUNICATION_VIEW_FORBIDDEN_MESSAGE = "Você não possui permissão para visualizar a comunicação.";
export const COMMUNICATION_EDIT_FORBIDDEN_MESSAGE = "Você não possui permissão para editar templates e kits visuais.";
export const COMMUNICATION_PUBLISH_FORBIDDEN_MESSAGE = "Você não possui permissão para enviar templates para aprovação ou sincronizá-los.";

export function assertCanViewCommunication(session: TAuthUserSession) {
	if (!canViewCommunication(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(COMMUNICATION_VIEW_FORBIDDEN_MESSAGE);
}

export function assertCanEditCommunication(session: TAuthUserSession) {
	if (!canEditCommunication(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(COMMUNICATION_EDIT_FORBIDDEN_MESSAGE);
}

export function assertCanPublishCommunication(session: TAuthUserSession) {
	if (!canPublishCommunication(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(COMMUNICATION_PUBLISH_FORBIDDEN_MESSAGE);
}

/**
 * Ler templates para escolher um: além de quem vê a comunicação, quem monta campanhas (seletor do
 * builder) e quem inicia atendimentos (seletor do hub).
 */
export function canPickMessageTemplates(session: TAuthUserSession): boolean {
	const permissoes = session.membership?.permissoes;
	if (!permissoes) return false;
	return canViewCommunication(permissoes) || canEditCampaigns(permissoes) || hasChatPermission({ session, permission: "iniciar" });
}

export function assertCanPickMessageTemplates(session: TAuthUserSession) {
	requireMembershipPermissions(session);
	if (!canPickMessageTemplates(session)) throw new createHttpError.Forbidden(COMMUNICATION_VIEW_FORBIDDEN_MESSAGE);
}

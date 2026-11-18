import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	canEditClients,
	canLookupClients,
	canManageClientBase,
	canRegisterClients,
	canUpdateClientRecords,
	canViewClients,
} from "@/lib/permissions/clients";
import createHttpError from "http-errors";

/**
 * Guardas das rotas de clientes. Recebem a sessão do route handler e lançam o erro HTTP; a regra de
 * cada permissão (e a semântica de ausência) mora em lib/permissions/clients.ts.
 */
function requireMembershipPermissions(session: TAuthUserSession) {
	const permissoes = session.membership?.permissoes;
	if (!permissoes) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return permissoes;
}

export const CLIENT_VIEW_FORBIDDEN_MESSAGE = "Você não possui permissão para visualizar clientes.";
export const CLIENT_CREATE_FORBIDDEN_MESSAGE = "Você não possui permissão para cadastrar clientes.";
export const CLIENT_EDIT_FORBIDDEN_MESSAGE = "Você não possui permissão para editar clientes.";
export const CLIENT_BASE_MANAGEMENT_FORBIDDEN_MESSAGE = "Você não possui permissão para gerenciar a base de clientes.";

/** Leituras do módulo de clientes (listagem, estatísticas, duplicados, segmentações). */
export function assertCanViewClients(session: TAuthUserSession) {
	if (!canViewClients(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_VIEW_FORBIDDEN_MESSAGE);
}

/** Localizar um cliente para operar (venda, atendimento): ver `canLookupClients`. */
export function assertCanLookupClients(session: TAuthUserSession) {
	if (!canLookupClients(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_VIEW_FORBIDDEN_MESSAGE);
}

/** Cadastro avulso de cliente (`POST /api/clients`), compartilhado pelo módulo de clientes e pela venda. */
export function assertCanRegisterClients(session: TAuthUserSession) {
	if (!canRegisterClients(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_CREATE_FORBIDDEN_MESSAGE);
}

/** Edição do cadastro (`PUT /api/clients`), compartilhada pelo módulo de clientes e pela venda. */
export function assertCanUpdateClientRecords(session: TAuthUserSession) {
	if (!canUpdateClientRecords(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_EDIT_FORBIDDEN_MESSAGE);
}

/** Edição de cliente que só acontece pelo CRM (contatos e pausa de comunicação): clientes.editar. */
export function assertCanEditClients(session: TAuthUserSession) {
	if (!canEditClients(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_EDIT_FORBIDDEN_MESSAGE);
}

/** Importar, mesclar, excluir, editar em massa, tags, campos personalizados, segmentações e carteiras. */
export function assertCanManageClientBase(session: TAuthUserSession) {
	if (!canManageClientBase(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CLIENT_BASE_MANAGEMENT_FORBIDDEN_MESSAGE);
}

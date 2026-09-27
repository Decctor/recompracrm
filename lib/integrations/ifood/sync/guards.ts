import { requireERPSession } from "@/lib/authentication/erp-session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canManageIntegrations, canViewIntegrations } from "@/lib/integrations/mask";
import createHttpError from "http-errors";

/**
 * Guardas das rotas de sincronização de catálogo. As rotas `catalog/*` sempre passaram por
 * `canViewIntegrations`/`canManageIntegrations`; as de `sync/*` nasceram só com a sessão ERP, o que
 * deixava qualquer membro vincular, publicar e desvincular. Mesma régua para as duas famílias.
 */
export function requireIntegrationViewSession(session: TAuthUserSession | null): TAuthUserSession {
	const erpSession = requireERPSession(session);
	if (!canViewIntegrations(erpSession.membership?.permissoes)) {
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar integrações.");
	}
	return erpSession;
}

export function requireIntegrationManageSession(session: TAuthUserSession | null): TAuthUserSession {
	const erpSession = requireERPSession(session);
	if (!canManageIntegrations(erpSession.membership?.permissoes)) {
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar integrações.");
	}
	return erpSession;
}

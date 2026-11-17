import type { TAuthUserSession } from "@/lib/authentication/types";
import { canActivateCampaigns, canEditCampaigns, canViewCampaigns } from "@/lib/permissions/campaigns";
import createHttpError from "http-errors";

/**
 * Guardas das rotas de campanhas. Recebem a sessão do route handler e lançam o erro HTTP; a regra de
 * cada permissão (e a semântica de ausência) mora em lib/permissions/campaigns.ts.
 */
function requireMembershipPermissions(session: TAuthUserSession) {
	const permissoes = session.membership?.permissoes;
	if (!permissoes) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return permissoes;
}

export const CAMPAIGN_VIEW_FORBIDDEN_MESSAGE = "Você não possui permissão para visualizar campanhas.";
export const CAMPAIGN_EDIT_FORBIDDEN_MESSAGE = "Você não possui permissão para editar campanhas.";
export const CAMPAIGN_ACTIVATION_FORBIDDEN_MESSAGE = "Você não possui permissão para ativar, pausar ou alterar campanhas ativas.";

export function assertCanViewCampaigns(session: TAuthUserSession) {
	if (!canViewCampaigns(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CAMPAIGN_VIEW_FORBIDDEN_MESSAGE);
}

export function assertCanEditCampaigns(session: TAuthUserSession) {
	if (!canEditCampaigns(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CAMPAIGN_EDIT_FORBIDDEN_MESSAGE);
}

export function assertCanActivateCampaigns(session: TAuthUserSession) {
	if (!canActivateCampaigns(requireMembershipPermissions(session))) throw new createHttpError.Forbidden(CAMPAIGN_ACTIVATION_FORBIDDEN_MESSAGE);
}

"use client";

import type { TCampaignPermissions } from "@/lib/permissions/campaigns";
import { createContext, type ReactNode, use } from "react";

/**
 * Permissões de campanhas do membro (lib/permissions/campaigns.ts), resolvidas no servidor pela
 * página e distribuídas aos blocos do módulo. A tela só esconde ações; quem barra é a API.
 */
const CampaignPermissionsContext = createContext<TCampaignPermissions | null>(null);

export function CampaignPermissionsProvider({ permissions, children }: { permissions: TCampaignPermissions; children: ReactNode }) {
	return <CampaignPermissionsContext value={permissions}>{children}</CampaignPermissionsContext>;
}

export function useCampaignPermissions(): TCampaignPermissions {
	const permissions = use(CampaignPermissionsContext);
	if (!permissions) throw new Error("useCampaignPermissions must be used within CampaignPermissionsProvider.");
	return permissions;
}

/** Editar uma campanha: `editar`, e `ativar` também quando ela está no ar. */
export function canEditCampaign(permissions: TCampaignPermissions, campaign: { ativo: boolean }): boolean {
	return permissions.editar && (!campaign.ativo || permissions.ativar);
}

export const CAMPAIGN_ACTIVATION_DENIED_HINT = "Sem permissão para ativar ou pausar campanhas";

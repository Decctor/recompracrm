"use client";

import type { TCommunicationPermissions } from "@/lib/permissions/communication";
import { createContext, type ReactNode, use } from "react";

/**
 * Permissões de comunicação do membro (lib/permissions/communication.ts), resolvidas no servidor pela
 * página e distribuídas aos blocos que abrem templates (seletores do builder de campanhas, tela de
 * templates). A tela só esconde ações; quem barra é a API.
 */
const CommunicationPermissionsContext = createContext<TCommunicationPermissions | null>(null);

export function CommunicationPermissionsProvider({ permissions, children }: { permissions: TCommunicationPermissions; children: ReactNode }) {
	return <CommunicationPermissionsContext value={permissions}>{children}</CommunicationPermissionsContext>;
}

export function useCommunicationPermissions(): TCommunicationPermissions {
	const permissions = use(CommunicationPermissionsContext);
	if (!permissions) throw new Error("useCommunicationPermissions must be used within CommunicationPermissionsProvider.");
	return permissions;
}

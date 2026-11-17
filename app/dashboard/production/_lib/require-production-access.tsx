import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveProductionPermissions, type TProductionPermissions } from "@/lib/permissions/productions";
import { canViewCosts } from "@/lib/permissions/sensitive-data";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

/**
 * Permissões que as telas de Produções recebem: as do módulo mais `visualizarCustos`
 * (dadosSensiveis), que decide se custo e margem aparecem. A API já manda esses campos como `null`
 * para quem não vê custos; a flag serve para a tela esconder blocos e ordenações inteiros.
 */
export type TProductionPagePermissions = TProductionPermissions & { visualizarCustos: boolean };

/**
 * Guarda comum das páginas de Produções: capability `production`, organização com ERP e, quando
 * pedida, a permissão específica. Devolve as permissões resolvidas ou a página de bloqueio a renderizar.
 */
export async function requireProductionAccess({
	permission,
	deniedMessage,
}: {
	permission?: keyof TProductionPermissions;
	deniedMessage?: string;
} = {}): Promise<{ permissions: TProductionPagePermissions; blocked: null } | { permissions: null; blocked: ReactElement }> {
	const { sessionUser, unauthorized } = await requireDashboardCapability("production");
	if (unauthorized) return { permissions: null, blocked: unauthorized };

	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.organizacao.configuracao.recursos.erp.acesso) {
		return { permissions: null, blocked: <UnauthorizedPage message="Oops, sua organização não possui acesso a este recurso." /> };
	}

	const permissions = resolveProductionPermissions(sessionUser.membership.permissoes);
	if (permission && !permissions[permission]) {
		return { permissions: null, blocked: <UnauthorizedPage message={deniedMessage ?? "Você não possui permissão para acessar esta página."} /> };
	}
	return { permissions: { ...permissions, visualizarCustos: canViewCosts(sessionUser.membership.permissoes) }, blocked: null };
}

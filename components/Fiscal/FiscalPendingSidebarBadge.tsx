"use client";

import { SidebarCountBadge } from "@/components/Sidebar/SidebarCountBadge";
import { useFiscalPending } from "@/lib/queries/fiscal";

/**
 * Badge do item "Fiscal" na sidebar: quantas pendencias exigem acao humana agora. A API exige
 * `fiscal.visualizar`; sem permissao a query falha silenciosamente e nada e renderizado.
 */
export function FiscalPendingSidebarBadge() {
	const { data } = useFiscalPending({ refetchInterval: 120_000 });
	return <SidebarCountBadge count={data?.resumo.total ?? 0} />;
}

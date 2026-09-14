"use client";

import { SidebarCountBadge } from "@/components/Sidebar/SidebarCountBadge";
import { useStoreCreditStats } from "@/lib/queries/store-credit";

/**
 * Badge do item "Fiados" na sidebar: quantos clientes estão com fiado vencido agora.
 *
 * Fiado vencido é exatamente o que se esquece — ninguém abre uma aba de cobrança por iniciativa
 * própria. A rota exige `financeiro.visualizar`; sem permissão a query falha em silêncio e nada é
 * renderizado, como na badge do Fiscal.
 */
export function StoreCreditOverdueSidebarBadge() {
	const { data } = useStoreCreditStats({ staleTime: 120_000, refetchInterval: 300_000 });
	return <SidebarCountBadge count={data?.clientesVencidos ?? 0} />;
}

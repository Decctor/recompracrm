"use client";

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
	const total = data?.clientesVencidos ?? 0;
	if (total === 0) return null;
	return (
		<span className="ml-auto rounded-full bg-destructive px-1.5 py-px text-[10px] font-bold tabular-nums text-destructive-foreground group-data-[collapsible=icon]:hidden">
			{total > 99 ? "99+" : total}
		</span>
	);
}

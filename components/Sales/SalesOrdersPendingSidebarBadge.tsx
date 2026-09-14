"use client";

import { SidebarCountBadge } from "@/components/Sidebar/SidebarCountBadge";
import { useSalesFulfillmentPending } from "@/lib/queries/sales-fulfillment";

/**
 * Badge do item "Pedidos" na sidebar: quantos pedidos ainda nao foram entregues.
 *
 * Diferente das badges de Fiscal e Fiados, esta conta a fila inteira e nao uma excecao — e por isso
 * usa o tom neutro. A rota exige ERP e `vendas.visualizar`; sem isso a query falha em silencio e
 * nada e renderizado.
 */
export function SalesOrdersPendingSidebarBadge({ className }: { className?: string } = {}) {
	const { data } = useSalesFulfillmentPending();
	return <SidebarCountBadge count={data?.total ?? 0} tone="neutral" className={className} />;
}

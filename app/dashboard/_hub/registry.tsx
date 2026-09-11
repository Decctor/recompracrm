"use client";

import type { TDashboardCapability } from "@/lib/access/capabilities";
import { type TCapabilityContext } from "@/lib/access/capabilities";
import { filterNavigationItems } from "@/lib/access/navigation";
import type { ComponentType } from "react";
import { ApprovalsWidget } from "./widgets/approvals-widget";
import { BirthdaysWidget } from "./widgets/birthdays-widget";
import { CampaignsWidget } from "./widgets/campaigns-widget";
import { CashbackExpiringWidget } from "./widgets/cashback-expiring-widget";
import { ChatsWidget } from "./widgets/chats-widget";
import { FinanceDueWidget } from "./widgets/finance-due-widget";
import { FiscalPendingWidget } from "./widgets/fiscal-pending-widget";
import { LowStockWidget } from "./widgets/low-stock-widget";
import { OpenOrdersWidget } from "./widgets/open-orders-widget";
import { OpenTabsWidget } from "./widgets/open-tabs-widget";
import { SegmentDropsWidget } from "./widgets/segment-drops-widget";
import { SellerRoutineWidget } from "./widgets/seller-routine-widget";

/**
 * Registro dos widgets do dashboard. Mesmo filtro de capacidades da sidebar e da paleta de comandos
 * (`filterNavigationItems`): um widget novo entra aqui com a capability que o governa e aparece
 * só para quem enxerga o módulo correspondente.
 *
 * Dois tipos, de propósito:
 * - `pendencia`: algo que exige ação agora (nomes + contexto + link para agir).
 * - `pulso`: um número de hoje/semana com link para a visão geral do módulo. Sem filtros — a análise
 *   profunda vive em cada módulo. Vendas de hoje e a meta ativa têm a faixa de destaque própria
 *   (`headline.tsx`) e não entram aqui.
 */
export type TDashboardWidgetKind = "pendencia" | "pulso";

/**
 * compacto: um número + duas linhas, o card inteiro é link.
 * lista: itens nomeados, ocupa duas linhas da grade.
 * largo: ocupa a largura toda — para widgets com duas colunas internas.
 */
export type TDashboardWidgetSize = "compacto" | "lista" | "largo";

export type TDashboardWidgetProps = {
	/** Ids de vendedor do escopo de resultados do membro; `null` = organização inteira. */
	scopeSellersIds: string[] | null;
	/** Vendedor vinculado ao membro (`organizationMembers.usuarioVendedorId`). */
	sellerId: string | null;
	canViewSensitive: boolean;
};

export type TDashboardWidget = {
	id: string;
	kind: TDashboardWidgetKind;
	capability: TDashboardCapability;
	size?: TDashboardWidgetSize;
	/** Widgets da rotina do vendedor só fazem sentido para membros com vendedor vinculado. */
	requiresSeller?: boolean;
	/** Condição extra além da capability (ex.: preferência da organização que liga o módulo). */
	isVisible?: (context: TDashboardWidgetContext) => boolean;
	Component: ComponentType<TDashboardWidgetProps>;
};

export const DashboardWidgetRegistry: readonly TDashboardWidget[] = [
	// Pendências — ordem por urgência: quem tem prazo em minutos primeiro, depois dinheiro parado,
	// documentos travados, reposição e, por fim, o relacionamento que está esfriando.
	{ id: "seller-routine", kind: "pendencia", capability: "portfolios", size: "lista", requiresSeller: true, Component: SellerRoutineWidget },
	{ id: "open-orders", kind: "pendencia", capability: "orders", size: "lista", Component: OpenOrdersWidget },
	{ id: "approvals", kind: "pendencia", capability: "approvals", size: "lista", Component: ApprovalsWidget },
	{ id: "finance-due", kind: "pendencia", capability: "finance", size: "lista", Component: FinanceDueWidget },
	{ id: "fiscal-pending", kind: "pendencia", capability: "fiscal", size: "lista", Component: FiscalPendingWidget },
	{
		id: "low-stock",
		kind: "pendencia",
		capability: "inventory",
		size: "lista",
		// Sem rastreamento de estoque, quantidade não significa nada — o widget só geraria alarme falso.
		isVisible: ({ organization }) => organization.configuracao.preferencias.rastreamentoEstoque === true,
		Component: LowStockWidget,
	},
	{ id: "chats", kind: "pendencia", capability: "whatsapp", Component: ChatsWidget },
	{ id: "segment-drops", kind: "pendencia", capability: "segments", size: "lista", Component: SegmentDropsWidget },
	// Pulso — relacionamento primeiro (é a alma do produto), depois a operação.
	{ id: "birthdays", kind: "pulso", capability: "customers", size: "lista", Component: BirthdaysWidget },
	{ id: "cashback-expiring", kind: "pulso", capability: "cashback", size: "lista", Component: CashbackExpiringWidget },
	{ id: "campaigns", kind: "pulso", capability: "campaigns", size: "largo", Component: CampaignsWidget },
	{ id: "open-tabs", kind: "pulso", capability: "serviceAccounts", Component: OpenTabsWidget },
];

export type TDashboardWidgetContext = TCapabilityContext & { sellerId: string | null };

export function resolveDashboardWidgets(context: TDashboardWidgetContext): TDashboardWidget[] {
	return filterNavigationItems([...DashboardWidgetRegistry], context).filter(
		(widget) => (!widget.requiresSeller || context.sellerId !== null) && (widget.isVisible?.(context) ?? true),
	);
}

"use client";
import CashbackProgramsPage from "@/app/dashboard/growth/cashback/control-cashback-programs-page";
import ProductPage from "@/app/dashboard/catalog/products/[productId]/product-page";
import SegmentsPage from "@/app/dashboard/customers/segments/segments-page";
import SalesResultsPage from "@/app/dashboard/sales/results/results-page";
import type { ReactNode } from "react";
import { DEMO_CASHBACK_PROGRAM } from "./fixtures/cashback";
import { DEMO_PRODUCT, DEMO_PRODUCT_ID } from "./fixtures/product";
import { DEMO_PRICE_COST_HISTORY, DEMO_RECIPES, DEMO_STOCK_ANALYTICS, DEMO_STOCK_LOTS, DEMO_STOCK_TRANSACTIONS } from "./fixtures/stock";
import { DEMO_GOALS_STATS, DEMO_GROUPED_SALES, DEMO_OVERALL_SALES, DEMO_SALES_GRAPH } from "./fixtures/sales";
import { DEMO_SALES_RESULTS } from "./fixtures/sales-results";
import { DEMO_EMPTY_CLIENTS, DEMO_RFM_LABELLED, DEMO_SALE_FILTER_OPTIONS } from "./fixtures/rfm";
import { DEMO_SESSION } from "./fixtures/session";

import type { TGetSubscriptionStatusOutput } from "@/app/api/organizations/subscription-status/route";
import type { TGetSalesChannelsStatusOutput } from "@/app/api/sales-channels/status/route";
import { mockApi } from "./mock-api";

type TScreenDefinition = {
	/** Rota real da tela, com os parâmetros que abrem a aba certa. */
	path: string;
	render: () => ReactNode;
};

// Trilho do cabeçalho: assinatura em dia e nenhum canal de venda com alerta.
mockApi("/api/organizations/subscription-status", () => ({ data: { ativa: true, status: "active", modo: "success", mensagem: "Assinatura ativa.", acao: "ASSINAR" }, message: "Status buscado." }) satisfies TGetSubscriptionStatusOutput);
mockApi("/api/sales-channels/status", () => ({ data: { canais: [] }, message: "Status dos canais de venda buscado com sucesso." }) satisfies TGetSalesChannelsStatusOutput);

mockApi("/api/cashback-programs", () => ({ data: DEMO_CASHBACK_PROGRAM, message: "Programa encontrado." }));

mockApi("/api/stats/sales-rfm-labelled", () => ({ data: DEMO_RFM_LABELLED }));
mockApi("/api/stats/sales-query-params", () => ({ data: DEMO_SALE_FILTER_OPTIONS }));
mockApi("/api/clients", () => DEMO_EMPTY_CLIENTS);
mockApi("/api/products", () => ({ data: { byId: DEMO_PRODUCT, default: undefined, stock: undefined } }));
mockApi("/api/products/stock-analytics", () => DEMO_STOCK_ANALYTICS);
mockApi("/api/products/stock-lots", () => DEMO_STOCK_LOTS);
mockApi("/api/products/stock-transactions", () => DEMO_STOCK_TRANSACTIONS);
mockApi("/api/products/price-cost-history", () => DEMO_PRICE_COST_HISTORY);
mockApi("/api/productions/recipes", () => DEMO_RECIPES);
mockApi("/api/stats/sales-overall", () => ({ data: DEMO_OVERALL_SALES }));
mockApi("/api/stats/sales-grouped", () => ({ data: DEMO_GROUPED_SALES }));
mockApi("/api/stats/sales-graph", () => ({ data: DEMO_SALES_GRAPH }));
mockApi("/api/goals/stats", () => DEMO_GOALS_STATS);
mockApi("/api/sales/results", () => DEMO_SALES_RESULTS);

export const SCREENS: Record<string, TScreenDefinition> = {
	"cashback-settings": {
		path: "/dashboard/growth/cashback?view=control-cashback-program",
		render: () => <CashbackProgramsPage userOrg={DEMO_SESSION.membership.organizacao} cashbackProgram={DEMO_CASHBACK_PROGRAM} />,
	},
	"rfm-segments": {
		path: "/dashboard/customers/segments",
		render: () => <SegmentsPage user={DEMO_SESSION.user} orgRFMConfig={null} />,
	},
	"product-abc": {
		path: `/dashboard/catalog/products/${DEMO_PRODUCT_ID}?tab=estoque`,
		render: () => <ProductPage user={DEMO_SESSION.user} userMembership={DEMO_SESSION.membership} id={DEMO_PRODUCT_ID} />,
	},
	"dashboard-ticket": {
		// Aba Operacional: o tile de ticket médio contra o mês anterior e a tabela por vendedor.
		path: "/dashboard/sales/results?view=operacional&after=2026-11-01T03:00:00.000Z&before=2026-12-01T02:59:59.999Z",
		render: () => (
			<SalesResultsPage
				user={DEMO_SESSION.user}
				userOrg={DEMO_SESSION.membership.organizacao}
				membership={DEMO_SESSION.membership}
				scopeSellersIds={[]}
				hasErpAccess={DEMO_SESSION.membership.organizacao.configuracao.recursos.erp.acesso}
			/>
		),
	},
};

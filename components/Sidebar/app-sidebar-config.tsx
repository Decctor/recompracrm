/**
 * Configuração de navegação da sidebar, separada do componente para que outros consumidores
 * (a paleta de comandos do header) possam oferecer os mesmos destinos com o mesmo filtro de
 * capacidades — uma rota nova entra aqui e aparece nos dois lugares.
 */
import type { TAuthUserSession } from "@/lib/authentication/types";
import { appRoutes } from "@/lib/navigation/routes";
import type { TDashboardCapability } from "@/lib/access/capabilities";
import { StoreCreditOverdueSidebarBadge } from "@/components/Finances/StoreCreditOverdueSidebarBadge";
import { FiscalPendingSidebarBadge } from "@/components/Fiscal/FiscalPendingSidebarBadge";
import { filterNavigationItems } from "@/lib/access/navigation";
import {
	ArrowRightLeft,
	BadgePercent,
	Banknote,
	BookText,
	Boxes,
	CalendarCheck,
	ChartNoAxesColumnIncreasing,
	CircleHelp,
	CirclePlay,
	ClipboardList,
	CreditCard,
	Factory,
	FileCheck2,
	Goal,
	Grid3X3,
	Handshake,
	Home,
	Kanban,
	Layers,
	List,
	Megaphone,
	MessageCircle,
	NotebookPen,
	Package,
	Plug,
	ReceiptText,
	ScanBarcode,
	Settings2,
	ShoppingCart,
	Store,
	Target,
	Ticket,
	TrendingUp,
	UserRound,
	UsersRound,
	UtensilsCrossed,
	Wallet,
} from "lucide-react";

export type TSidebarAccessContext = {
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	permissions: NonNullable<TAuthUserSession["membership"]>["permissoes"];
};

export type TSidebarConfigItem = {
	group: string;
	items: TSidebarItem[];
};

export type TSidebarItem = {
	id: string;
	capability?: TDashboardCapability;
	activeMatch?: "exact" | "prefix";
	title: string;
	url: string | null;
	icon: React.ReactNode;
	// Contagem viva ao lado do titulo (ex.: pendencias fiscais). Renderizado so quando > 0.
	badge?: React.ReactNode;
	items: TSidebarItem[] | null;
};

type TSidebarConfigItemWithAccess = {
	group: string;
	items: TSidebarItem[];
};

export const AppSidebarConfig: TSidebarConfigItemWithAccess[] = [
	{
		group: "Geral",
		items: [
			{
				id: "dashboard",
				capability: "dashboard",
				activeMatch: "exact",
				title: "Dashboard",
				url: appRoutes.dashboard(),
				icon: <Home className="size-4" />,
				items: null,
			},
		],
	},
	{
		group: "Vendas",
		items: [
			{
				id: "sales",
				capability: "sales",
				title: "Vendas",
				// Ownership path keeps the group active for details, creation, import, edit, and checkout routes.
				url: appRoutes.sales.root(),
				icon: <ShoppingCart className="size-4" />,
				items: [
					{
						id: "new-sale",
						capability: "newSale",
						title: "Nova venda",
						url: appRoutes.sales.new(),
						icon: <ScanBarcode className="size-4" />,
						items: null,
					},
					{
						id: "sales-history",
						capability: "sales",
						activeMatch: "exact",
						title: "Histórico",
						url: appRoutes.sales.root(),
						icon: <ReceiptText className="size-4" />,
						items: null,
					},
					{
						id: "sales-results",
						capability: "salesResults",
						title: "Resultados",
						url: appRoutes.sales.results(),
						icon: <ChartNoAxesColumnIncreasing className="size-4" />,
						items: null,
					},
					{
						id: "sales-orders",
						capability: "orders",
						title: "Pedidos",
						url: appRoutes.sales.orders(),
						icon: <Kanban className="size-4" />,
						items: null,
					},
					{
						id: "sales-cash",
						capability: "cashSessions",
						title: "Caixa",
						url: appRoutes.sales.cashSessions(),
						icon: <Banknote className="size-4" />,
						items: null,
					},
					{
						id: "service-accounts",
						capability: "serviceAccounts",
						title: "Mesas e comandas",
						url: appRoutes.sales.serviceAccounts(),
						icon: <UtensilsCrossed className="size-4" />,
						items: null,
					},
					{
						id: "approvals",
						capability: "approvals",
						title: "Aprovações",
						url: appRoutes.approvals(),
						icon: <ReceiptText className="size-4" />,
						items: null,
					},
				],
			},
		],
	},
	{
		group: "Operação",
		items: [
			{
				id: "preparation",
				capability: "preparation",
				title: "Preparo",
				url: appRoutes.operations.preparation(),
				icon: <Package className="size-4" />,
				items: null,
			},
			{
				id: "purchases",
				capability: "purchases",
				title: "Compras",
				url: appRoutes.purchases(),
				icon: <ShoppingCart className="size-4" />,
				items: null,
			},
			{
				id: "production",
				capability: "production",
				title: "Produções",
				url: appRoutes.production(),
				icon: <Factory className="size-4" />,
				items: null,
			},
			{
				id: "products",
				capability: "products",
				title: "Produtos",
				url: appRoutes.catalog.products(),
				icon: <Package className="size-4" />,
				items: null,
			},
			{
				id: "inventory",
				capability: "inventory",
				title: "Estoque",
				// Ownership path keeps the group active on detail routes (ex.: lote específico).
				url: appRoutes.inventory.root(),
				icon: <Boxes className="size-4" />,
				items: [
					{
						id: "inventory-overview",
						capability: "inventory",
						activeMatch: "exact",
						title: "Visão geral",
						url: appRoutes.inventory.root(),
						icon: <TrendingUp className="size-4" />,
						items: null,
					},
					{
						id: "inventory-movements",
						capability: "inventory",
						title: "Movimentações",
						url: appRoutes.inventory.movements(),
						icon: <ArrowRightLeft className="size-4" />,
						items: null,
					},
					{
						id: "inventory-lots",
						capability: "inventory",
						title: "Lotes",
						url: appRoutes.inventory.lots(),
						icon: <Layers className="size-4" />,
						items: null,
					},
					{
						id: "inventory-recount",
						capability: "inventory",
						title: "Recontagem",
						url: appRoutes.inventory.recount(),
						icon: <ClipboardList className="size-4" />,
						items: null,
					},
				],
			},
		],
	},
	{
		group: "Relacionamento",
		items: [
			{
				id: "customers",
				capability: "customers",
				title: "Clientes",
				url: appRoutes.customers.root(),
				icon: <UsersRound className="size-4" />,
				items: null,
			},
			{
				id: "customer-portfolios",
				capability: "portfolios",
				title: "Carteiras",
				url: appRoutes.customers.portfolios(),
				icon: <CalendarCheck className="size-4" />,
				items: null,
			},
			{
				id: "segments",
				capability: "segments",
				title: "Matriz RFM",
				url: appRoutes.customers.segments(),
				icon: <Grid3X3 className="size-4" />,
				items: null,
			},
			{
				id: "campaigns",
				capability: "campaigns",
				title: "Campanhas",
				url: appRoutes.growth.campaigns(),
				icon: <Megaphone className="size-4" />,
				items: null,
			},
			{
				id: "audiences",
				capability: "audiences",
				title: "Públicos",
				url: appRoutes.growth.audiences(),
				icon: <UsersRound className="size-4" />,
				items: null,
			},
			{
				id: "cashback",
				capability: "cashback",
				title: "Cashback",
				url: appRoutes.growth.cashback(),
				icon: <BadgePercent className="size-4" />,
				items: null,
			},
			{
				id: "coupons",
				capability: "coupons",
				title: "Cupons",
				url: appRoutes.growth.coupons(),
				icon: <Ticket className="size-4" />,
				items: null,
			},
		],
	},
	{
		group: "Gestão",
		items: [
			{
				id: "finance",
				capability: "finance",
				title: "Financeiro",
				// Ownership path keeps the group active for every finance workspace and report route.
				url: appRoutes.finance.root(),
				icon: <Wallet className="size-4" />,
				items: [
					{
						id: "finance-overview",
						capability: "finance",
						activeMatch: "exact",
						title: "Visão geral",
						url: appRoutes.finance.root(),
						icon: <TrendingUp className="size-4" />,
						items: null,
					},
					{
						id: "finance-reports",
						capability: "finance",
						title: "Relatórios",
						url: appRoutes.finance.reports.root(),
						icon: <ChartNoAxesColumnIncreasing className="size-4" />,
						items: null,
					},
					{
						id: "finance-entries",
						capability: "finance",
						title: "Lançamentos",
						url: appRoutes.finance.entries(),
						icon: <List className="size-4" />,
						items: null,
					},
					{
						id: "finance-transactions",
						capability: "finance",
						title: "Movimentações",
						url: appRoutes.finance.transactions(),
						icon: <ArrowRightLeft className="size-4" />,
						items: null,
					},
					{
						id: "finance-store-credit",
						capability: "finance",
						title: "Fiados",
						url: appRoutes.finance.storeCredit(),
						icon: <NotebookPen className="size-4" />,
						badge: <StoreCreditOverdueSidebarBadge />,
						items: null,
					},
					{
						id: "finance-accounts",
						capability: "finance",
						title: "Contas financeiras",
						url: appRoutes.finance.accounts(),
						icon: <Banknote className="size-4" />,
						items: null,
					},
					{
						id: "finance-credit-cards",
						capability: "finance",
						title: "Faturas de cartão",
						url: appRoutes.finance.creditCards(),
						icon: <CreditCard className="size-4" />,
						items: null,
					},
					{
						id: "finance-reconciliation",
						capability: "finance",
						title: "Conciliação",
						url: appRoutes.finance.reconciliation(),
						icon: <FileCheck2 className="size-4" />,
						items: null,
					},
				],
			},
			{
				id: "fiscal",
				capability: "fiscal",
				title: "Fiscal",
				url: appRoutes.fiscal.root(),
				icon: <BookText className="size-4" />,
				badge: <FiscalPendingSidebarBadge />,
				items: null,
			},
			{
				id: "goals",
				capability: "goals",
				title: "Metas",
				url: appRoutes.management.goals(),
				icon: <Goal className="size-4" />,
				items: null,
			},
			{
				id: "sellers",
				capability: "sellers",
				title: "Vendedores",
				url: appRoutes.management.sellers(),
				icon: <UserRound className="size-4" />,
				items: null,
			},
			{
				id: "partners",
				capability: "partners",
				title: "Parceiros",
				url: appRoutes.management.partners(),
				icon: <Handshake className="size-4" />,
				items: null,
			},
		],
	},
	{
		group: "Canais",
		items: [
			{
				id: "whatsapp",
				capability: "whatsapp",
				title: "WhatsApp Hub",
				url: appRoutes.channels.whatsapp(),
				icon: <MessageCircle className="size-4" />,
				items: null,
			},
			{
				id: "point-of-interaction",
				capability: "pointOfInteraction",
				title: "Ponto de interação",
				url: appRoutes.sales.pointOfInteraction(),
				icon: <CirclePlay className="size-4" />,
				items: null,
			},
			{
				id: "digital-store",
				capability: "store",
				title: "Loja digital",
				url: appRoutes.catalog.store(),
				icon: <Store className="size-4" />,
				items: null,
			},
			{
				id: "paid-media",
				capability: "paidMedia",
				title: "Mídia paga",
				url: appRoutes.channels.paidMedia(),
				icon: <Target className="size-4" />,
				items: null,
			},
		],
	},
	{
		group: "Sistema",
		items: [
			{
				id: "help",
				title: "Ajuda",
				url: "/ajuda",
				icon: <CircleHelp className="size-4" />,
				items: null,
			},
			{
				id: "integrations",
				capability: "integrations",
				title: "Integrações",
				url: appRoutes.integrations(),
				icon: <Plug className="size-4" />,
				items: null,
			},
			{
				id: "settings",
				capability: "settings",
				title: "Configurações",
				url: appRoutes.settings(),
				icon: <Settings2 className="size-4" />,
				items: null,
			},
		],
	},
];

export function filterSidebarConfig(config: TSidebarConfigItemWithAccess[], context: TSidebarAccessContext): TSidebarConfigItem[] {
	return config
		.map((group) => ({
			group: group.group,
			items: filterNavigationItems(group.items, context).filter((item) => item.url !== null || (item.items?.length ?? 0) > 0),
		}))
		.filter((group) => group.items.length > 0);
}

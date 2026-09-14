import type { TAppRoutePath } from "@/config";
import {
	ArrowRightLeft,
	BadgePercent,
	Banknote,
	BookText,
	Boxes,
	CalendarCheck,
	CalendarClock,
	CirclePlay,
	CreditCard,
	Factory,
	FileCheck2,
	FileSpreadsheet,
	Goal,
	GraduationCap,
	Grid3X3,
	Handshake,
	Home,
	Kanban,
	List,
	Megaphone,
	MessageCircle,
	NotebookPen,
	Package,
	PackageSearch,
	Plug,
	ReceiptText,
	Scale,
	ScanBarcode,
	Settings,
	Shield,
	ShoppingCart,
	Store,
	Target,
	Ticket,
	type LucideIcon,
	UserRound,
	UsersRound,
	UtensilsCrossed,
	Wallet,
} from "lucide-react";

// ============================================================================
// Ícone de cada rota mapeada, no mesmo vocabulário do AppSidebar — a mesma rota
// usa o mesmo símbolo na navegação e no cabeçalho.
//
// Vive separado de config/index.ts de propósito: aquele módulo entra na cadeia
// de imports do servidor (rotas de API, sessão) e não deve arrastar componentes
// React junto. O Record tipado por TAppRoutePath garante que toda rota do
// AppRoutes tenha ícone — esquecer um quebra o build, não a interface.
// ============================================================================

export const APP_ROUTE_ICONS: Record<TAppRoutePath, LucideIcon> = {
	"/dashboard": Home,
	"/dashboard/sales/point-of-interaction": CirclePlay,
	"/dashboard/sales": ShoppingCart,
	"/dashboard/sales/new": ScanBarcode,
	"/dashboard/sales/orders": Kanban,
	"/dashboard/operations/preparation": Package,
	"/dashboard/approvals": ReceiptText,
	"/dashboard/sales/service-accounts": UtensilsCrossed,
	"/dashboard/sales/cash-sessions": Banknote,
	"/dashboard/customers/segments": Grid3X3,
	"/dashboard/customers": UsersRound,
	"/dashboard/management/partners": Handshake,
	"/dashboard/catalog/products": Package,
	"/dashboard/growth/campaigns": Megaphone,
	"/dashboard/growth/cashback": BadgePercent,
	"/dashboard/growth/coupons": Ticket,
	"/dashboard/catalog/store": Store,
	"/dashboard/growth/audiences": UsersRound,
	"/dashboard/channels/paid-media": Target,
	"/dashboard/integrations": Plug,
	"/dashboard/customers/portfolios": CalendarCheck,
	"/dashboard/management/sellers": UserRound,
	"/dashboard/management/goals": Goal,
	"/dashboard/channels/whatsapp": MessageCircle,
	"/dashboard/production": Factory,
	"/dashboard/inventory": Boxes,
	"/dashboard/inventory/lots": PackageSearch,
	"/dashboard/finance": Wallet,
	"/dashboard/finance/entries": List,
	"/dashboard/finance/transactions": ArrowRightLeft,
	"/dashboard/finance/accounts": Banknote,
	"/dashboard/finance/store-credit": NotebookPen,
	"/dashboard/finance/credit-cards": CreditCard,
	"/dashboard/finance/reconciliation": FileCheck2,
	"/dashboard/finance/reports/income-statement": FileSpreadsheet,
	"/dashboard/finance/reports/cash-flow": CalendarClock,
	"/dashboard/finance/reports/receivables-payables": Scale,
	"/dashboard/fiscal": BookText,
	"/dashboard/purchases": ShoppingCart,
	"/dashboard/settings": Settings,
	"/admin-dashboard": Shield,
	"/admin-dashboard/partnerships": Handshake,
	"/admin-dashboard/community": GraduationCap,
};

export function getAppRouteIcon(path: string): LucideIcon | null {
	return APP_ROUTE_ICONS[path as TAppRoutePath] ?? null;
}

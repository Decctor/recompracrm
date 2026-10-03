import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveDiscountAuthority } from "@/lib/permissions/discounts";
import { canViewFinances } from "@/lib/permissions/finances";

export const dashboardCapabilities = {
	dashboard: "dashboard",
	sales: "sales",
	salesResults: "salesResults",
	newSale: "newSale",
	cashSessions: "cashSessions",
	orders: "orders",
	preparation: "preparation",
	approvals: "approvals",
	serviceAccounts: "serviceAccounts",
	purchases: "purchases",
	production: "production",
	products: "products",
	inventory: "inventory",
	customers: "customers",
	portfolios: "portfolios",
	segments: "segments",
	campaigns: "campaigns",
	audiences: "audiences",
	cashback: "cashback",
	coupons: "coupons",
	finance: "finance",
	fiscal: "fiscal",
	goals: "goals",
	sellers: "sellers",
	partners: "partners",
	whatsapp: "whatsapp",
	pointOfInteraction: "pointOfInteraction",
	store: "store",
	paidMedia: "paidMedia",
	visualKits: "visualKits",
	integrations: "integrations",
	settings: "settings",
} as const;

export type TDashboardCapability = (typeof dashboardCapabilities)[keyof typeof dashboardCapabilities];

export type TCapabilityContext = {
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	permissions: NonNullable<TAuthUserSession["membership"]>["permissoes"];
};

function canViewIntegrations(context: TCapabilityContext) {
	return (
		context.organization.configuracao.recursos.integracoes.acesso &&
		(context.permissions.integracoes?.visualizar ?? context.permissions.empresa.visualizar)
	);
}

export function canAccessDashboardCapability(capability: TDashboardCapability, context: TCapabilityContext): boolean {
	const { organization, permissions } = context;
	const erp = organization.configuracao.recursos.erp.acesso;

	switch (capability) {
		case "dashboard":
		case "products":
		case "customers":
		case "segments":
		case "pointOfInteraction":
		// Comunicação visual: sem restrição de plano por enquanto — a capability existe para que a
		// restrição, quando vier, mude num lugar só.
		case "visualKits":
			return true;
		case "sales":
			return permissions.vendas.visualizar;
		// Resultados de vendas existem para qualquer organização com permissão de resultados; os blocos
		// operacionais (recebimentos, fiscal) são condicionais ao ERP dentro da página.
		case "salesResults":
			return permissions.resultados.visualizar;
		case "newSale":
			return erp && permissions.vendas.visualizar;
		case "cashSessions":
			return permissions.vendas.visualizar && organization.configuracao.preferencias.sessoesVenda?.habilitado === true;
		case "orders":
		case "preparation":
			return erp && permissions.vendas.visualizar;
		case "approvals":
			return erp && resolveDiscountAuthority(permissions).aprovar;
		case "serviceAccounts":
			return erp && permissions.vendas.visualizar && organization.configuracao.preferencias.contasAtendimento?.habilitado === true;
		case "purchases":
			return erp && permissions.compras.visualizar;
		case "production":
		case "inventory":
			return erp && permissions.empresa.visualizar;
		case "portfolios":
			return organization.configuracao.preferencias.carteirasClientes?.habilitado === true;
		case "campaigns":
		case "audiences":
		case "coupons":
			return organization.configuracao.recursos.campanhas.acesso;
		case "cashback":
			return organization.configuracao.recursos.programasCashback.acesso;
		case "finance":
			return erp && canViewFinances(permissions);
		case "fiscal":
			return erp && permissions.fiscal.visualizar;
		case "goals":
			return permissions.resultados.visualizarMetas;
		case "sellers":
			return permissions.usuarios.visualizar;
		case "partners":
			return permissions.empresa.visualizar;
		case "whatsapp":
			return organization.configuracao.recursos.hubAtendimentos.acesso && permissions.atendimentos.visualizar;
		case "store":
			return erp;
		case "paidMedia":
		case "integrations":
			return canViewIntegrations(context);
		case "settings":
			return permissions.empresa.visualizar;
	}
}

export function resolveDashboardCapabilities(context: TCapabilityContext): ReadonlySet<TDashboardCapability> {
	return new Set(
		(Object.values(dashboardCapabilities) as TDashboardCapability[]).filter((capability) => canAccessDashboardCapability(capability, context)),
	);
}

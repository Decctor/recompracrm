import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TUserPermissions } from "@/schemas/users";
import type { TOrganizationEntity } from "@/services/drizzle/schema";

export const SESSION_COOKIE_NAME = "syncrono-session";

export const DEFAULT_ORGANIZATION_OWNER_PERMISSIONS: TUserPermissions = {
	usuarios: {
		visualizar: true,
		criar: true,
		editar: true,
		excluir: true,
	},
	resultados: {
		escopo: null,
		visualizar: true,
		criarMetas: true,
		visualizarMetas: true,
		editarMetas: true,
		excluirMetas: true,
	},
	atendimentos: {
		iniciar: true,
		visualizar: true,
		responder: true,
		finalizar: true,
		receberTransferencias: true,
	},
	empresa: {
		visualizar: true,
		editar: true,
	},
};

export const DEFAULT_ORGANIZATION_RFM_CONFIG = {
	recencia: {
		"1": {
			max: 999,
			min: 271,
		},
		"2": {
			max: 270,
			min: 181,
		},
		"3": {
			max: 180,
			min: 91,
		},
		"4": {
			max: 90,
			min: 31,
		},
		"5": {
			max: 30,
			min: 0,
		},
	},
	monetario: {
		"1": {
			max: 100,
			min: 1,
		},
		"2": {
			max: 300,
			min: 101,
		},
		"3": {
			max: 750,
			min: 301,
		},
		"4": {
			max: 2000,
			min: 751,
		},
		"5": {
			max: 99999999,
			min: 2001,
		},
	},
	frequencia: {
		"1": {
			max: 1,
			min: 1,
		},
		"2": {
			max: 2,
			min: 2,
		},
		"3": {
			max: 5,
			min: 3,
		},
		"4": {
			max: 10,
			min: 6,
		},
		"5": {
			max: 999999,
			min: 11,
		},
	},
	identificador: "CONFIG_RFM" as const,
};

export const FREE_TRIAL_DURATION_DAYS = 15;

export type TAppSubscriptionPlanKey = "ESSENCIAL" | "CRESCIMENTO" | "ESCALA";

export const DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES: TOrganizationConfiguration["recursos"] = {
	analytics: {
		acesso: true,
	},
	campanhas: {
		acesso: false,
		limiteAtivas: 0,
	},
	programasCashback: {
		acesso: true,
	},
	hubAtendimentos: {
		acesso: false,
		limiteAtendentes: 0,
	},
	integracoes: {
		acesso: false,
		limiteAtivas: 0,
	},
	iaDicas: {
		acesso: false,
		limiteSemanal: 0,
	},
	iaAtendimento: {
		acesso: false,
		limiteCreditos: 0,
	},
	relatoriosWhatsapp: {
		acesso: false,
	},
};

export const AppSubscriptionPlans: {
	[key in TAppSubscriptionPlanKey]: {
		name: string;
		description: string;
		badgeColor: string;
		badgeForeground: string;
		routes: {
			[key: string]: {
				accessible: boolean;
				redirectTo: string | null;
			};
		};
		capabilities: TOrganizationConfiguration["recursos"];
		stripeProdutoId: string;
		pricingTableFeatures: {
			checked: boolean;
			label: string;
		}[];
		pricing: {
			monthly: {
				price: number;
				currency: string;
				interval: "month" | "year";
				stripePriceId: string;
			};
			yearly: {
				price: number;
				currency: string;
				interval: "month" | "year";
				stripePriceId: string;
			};
		};
		color: string;
	};
} = {
	ESSENCIAL: {
		name: "ESSENCIAL",
		description: "Comece hoje. Cashback + PDV em tablet + campanhas básicas. Sem integração obrigatória.",
		badgeColor: "hsl(357 100% 45%)",
		badgeForeground: "hsl(222.2 47.4% 11.2%)",
		routes: {
			dashboard: {
				accessible: false,
				redirectTo: "/dashboard/commercial/cashback-programs",
			},
			"/dashboard/commercial/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/clients": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/products": {
				accessible: false,
				redirectTo: "/dashboard/commercial/products",
			},
			"/dashboard/commercial/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/cashback-programs": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/team/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/team/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/chats": {
				accessible: false,
				redirectTo: "/dashboard/commercial/campaigns",
			},
			"/dashboard/settings": {
				accessible: true,
				redirectTo: null,
			},
		},
		capabilities: {
			analytics: {
				acesso: true,
			},
			campanhas: {
				acesso: true,
				limiteAtivas: 5,
			},
			programasCashback: {
				acesso: true,
			},
			hubAtendimentos: {
				acesso: false,
				limiteAtendentes: 0,
			},
			integracoes: {
				acesso: false,
				limiteAtivas: 0,
			},
			iaDicas: {
				acesso: false,
				limiteSemanal: 0,
			},
			iaAtendimento: {
				acesso: false,
				limiteCreditos: 0,
			},
			relatoriosWhatsapp: {
				acesso: false,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Business Intelligence",
			},
			{
				checked: true,
				label: "Até 5 campanhas/jornadas ativas",
			},
			{
				checked: true,
				label: "Programas de cashback flexíveis",
			},
			{
				checked: true,
				label: "Ponto de Interação (tablet) para acumulação de cashback",
			},
		],
		stripeProdutoId: process.env.NEXT_PUBLIC_STRIPE_PRODUCT_ID_STARTER as string,
		pricing: {
			monthly: {
				price: 199.9,
				currency: "BRL",
				interval: "month",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ESSENCIAL_MONTHLY_PLAN_PRICE_ID as string,
			},
			yearly: {
				price: 1919.9,
				currency: "BRL",
				interval: "year",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ESSENCIAL_YEARLY_PLAN_PRICE_ID as string,
			},
		},
		color: "#E7000B",
	},
	CRESCIMENTO: {
		name: "CRESCIMENTO",
		description: "BI completo + IA que sugere ações + integração com ERP. O mais escolhido.",
		badgeColor: "hsl(216 62% 38%)",
		badgeForeground: "hsl(355.7 100% 97.3%)",
		routes: {
			dashboard: {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/clients": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/products": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/cashback-programs": {
				accessible: true,
				redirectTo: "/dashboard/commercial/cashback-programs",
			},
			"/dashboard/team/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/team/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/chats": {
				accessible: false,
				redirectTo: "/dashboard/commercial/campaigns",
			},
			"/dashboard/settings": {
				accessible: true,
				redirectTo: null,
			},
		},
		stripeProdutoId: process.env.NEXT_PUBLIC_STRIPE_PRODUCT_ID_PLUS as string,
		capabilities: {
			analytics: {
				acesso: true,
			},
			campanhas: {
				acesso: true,
				limiteAtivas: 10,
			},
			programasCashback: {
				acesso: true,
			},
			integracoes: {
				acesso: true,
				limiteAtivas: null,
			},
			relatoriosWhatsapp: {
				acesso: true,
			},
			hubAtendimentos: {
				acesso: false,
				limiteAtendentes: 0,
			},
			iaAtendimento: {
				acesso: true,
				limiteCreditos: null,
			},
			iaDicas: {
				acesso: true,
				limiteSemanal: null,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Business Intelligence completo (vendas, produtos, vendedores e parceiros)",
			},
			{
				checked: true,
				label: "Integrações com ERPs (sincronização de dados automática)",
			},
			{
				checked: true,
				label: "Até 10 campanhas/jornadas ativas",
			},
			{
				checked: true,
				label: "Programas de cashback flexíveis",
			},
			{
				checked: true,
				label: "Ponto de Interação personalizado para acumulação de cashback",
			},
			{
				checked: true,
				label: "Dicas de IA personalizadas para o seu negócio",
			},
			{
				checked: true,
				label: "Relatórios de vendas direto no seu WhatsApp",
			},
		],
		pricing: {
			monthly: {
				price: 399.9,
				currency: "BRL",
				interval: "month",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_CRESCIMENTO_MONTHLY_PLAN_PRICE_ID as string,
			},
			yearly: {
				price: 3839.9,
				currency: "BRL",
				interval: "year",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_CRESCIMENTO_YEARLY_PLAN_PRICE_ID as string,
			},
		},
		color: "#24549C",
	},
	ESCALA: {
		name: "ESCALA",
		description: "Tudo do Crescimento + Hub de atendimentos + IA que responde clientes 24/7.",
		badgeColor: "hsl(44 100% 50%)",
		badgeForeground: "hsl(210 40% 98%)",
		routes: {
			dashboard: {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/clients": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/products": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/commercial/cashback-programs": {
				accessible: true,
				redirectTo: "/dashboard/commercial/cashback-programs",
			},
			"/dashboard/team/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/team/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/chats": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/settings": {
				accessible: true,
				redirectTo: null,
			},
		},
		stripeProdutoId: process.env.NEXT_PUBLIC_STRIPE_PRODUCT_ID_PLUS as string,
		capabilities: {
			analytics: {
				acesso: true,
			},
			campanhas: {
				acesso: true,
				limiteAtivas: null,
			},
			programasCashback: {
				acesso: true,
			},
			integracoes: {
				acesso: true,
				limiteAtivas: null,
			},
			relatoriosWhatsapp: {
				acesso: true,
			},
			hubAtendimentos: {
				acesso: true,
				limiteAtendentes: 5,
			},
			iaDicas: {
				acesso: true,
				limiteSemanal: null,
			},
			iaAtendimento: {
				acesso: true,
				limiteCreditos: null,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Business Intelligence completo (vendas, produtos, vendedores e parceiros)",
			},
			{
				checked: true,
				label: "Integrações com ERP (sincronização de dados automática)",
			},
			{
				checked: true,
				label: "Campanhas/jornadas ilimitadas (uso justo)",
			},
			{
				checked: true,
				label: "Programas de cashback flexíveis",
			},
			{
				checked: true,
				label: "Ponto de Interação personalizado para acumulação de cashback",
			},
			{
				checked: true,
				label: "Dicas de IA personalizadas para o seu negócio",
			},
			{
				checked: true,
				label: "Relatórios de vendas direto no seu WhatsApp",
			},
			{
				checked: true,
				label: "Hub de Atendimentos (até 10 atendentes)",
			},
			{
				checked: true,
				label: "Atendimento com IA",
			},
		],
		pricing: {
			monthly: {
				price: 899.9,
				currency: "BRL",
				interval: "month",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ESCALA_MONTHLY_PLAN_PRICE_ID as string,
			},
			yearly: {
				price: 8639.9,
				currency: "BRL",
				interval: "year",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ESCALA_YEARLY_PLAN_PRICE_ID as string,
			},
		},
		color: "#FFB900",
	},
};

export function getOrganizationAccessToRoute({ organizationPlan, path }: { organizationPlan: keyof typeof AppSubscriptionPlans; path: string }) {
	const plan = AppSubscriptionPlans[organizationPlan];
	const route = plan.routes[path as keyof typeof plan.routes];
	if (!route) return { access: false, redirectTo: "/" };
	if (!route.accessible) return { access: false, redirectTo: route.redirectTo || "/" };
	return { access: true, redirectTo: null };
}
export const AppRoutes = [
	{
		path: "/dashboard",
		title: "Dashboard",
		description: "Visão geral das principais métricas do seu negócio",
	},
	{
		path: "/dashboard/commercial/sales",
		title: "Vendas",
		description: "Listagem das vendas realizadas",
	},
	{
		path: "/dashboard/commercial/segments",
		title: "Segmentações",
		description: "Visualização da matriz RFM de clientes.",
	},
	{
		path: "/dashboard/commercial/clients",
		title: "Clientes",
		description: "Painel detalhadado do seu portfólio de clientes.",
	},
	{
		path: "/dashboard/commercial/partners",
		title: "Parceiros",
		description: "Painel detalhadado dos seus parceiros comerciais.",
	},
	{
		path: "/dashboard/commercial/products",
		title: "Produtos",
		description: "Painel detalhadado dos seus produtos.",
	},
	{
		path: "/dashboard/commercial/campaigns",
		title: "Campanhas",
		description: "Painel de acompanhamento e gestão das campanhas de vendas.",
	},
	{
		path: "/dashboard/commercial/cashback-programs",
		title: "Programas de Cashback",
		description: "Painel de acompanhamento e gestão do seu programa de cashback.",
	},
	{
		path: "/dashboard/team/sellers",
		title: "Vendedores",
		description: "Painel detalhadado dos seus vendedores.",
	},
	{
		path: "/dashboard/team/goals",
		title: "Metas",
		description: "Painel de acompanhamento e gestão das metas de vendas.",
	},
	{
		path: "/dashboard/chats",
		title: "Conversas",
		description: "Hub de atendimento com os clientes.",
	},
	{
		path: "/dashboard/settings",
		title: "Configurações",
		description: "Configurações do seu negócio.",
	},
	{
		path: "/admin-dashboard",
		title: "Painel Admin",
		description: "Painel de administração do sistema.",
	},
	{
		path: "/admin-dashboard/crm",
		title: "Funil de Vendas",
		description: "Funil de vendas da plataforma.",
	},
	{
		path: "/admin-dashboard/crm/dashboard",
		title: "Dashboard",
		description: "Dashboard do funil de vendas.",
	},
	{
		path: "/admin-dashboard/crm/activities",
		title: "Atividades",
		description: "Painel de acompanhamento das atividades.",
	},
	{
		path: "/admin-dashboard/community",
		title: "Comunidade",
		description: "Painel de acompanhamento e gestão da comunidade RecompraCRM.",
	},
];
export function getAppRouteTitle(path: string) {
	const route = AppRoutes.find((route) => route.path === path);
	return route?.title || "";
}
export function getAppRouteDescription(path: string) {
	const route = AppRoutes.find((route) => route.path === path);
	return route?.description || "";
}

type TCheckSubscriptionStatus = {
	stripeStatus: TOrganizationEntity["stripeSubscriptionStatus"];
	trialPeriodStart: TOrganizationEntity["periodoTesteInicio"];
	trialPeriodEnd: TOrganizationEntity["periodoTesteFim"];
};
export function checkSubscriptionStatus({ stripeStatus, trialPeriodStart, trialPeriodEnd }: TCheckSubscriptionStatus) {
	if (stripeStatus === "active") return true;
	if (!trialPeriodStart || !trialPeriodEnd) return false;
	const now = new Date();
	const trialEnd = new Date(trialPeriodEnd);
	return now < trialEnd;
}

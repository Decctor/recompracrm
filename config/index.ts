import type { TOrganizationDefaults, TOrganizationConfiguration } from "@/schemas/organizations";
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
		visualizarSensiveis: true,
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
	vendas: {
		visualizar: true,
		criar: true,
		editar: true,
		excluir: true,
	},
	compras: {
		visualizar: true,
		criar: true,
		editar: true,
		excluir: true,
	},
	fiscal: {
		visualizar: true,
		configurar: true,
		emitir: true,
		cancelar: true,
	},
	integracoes: {
		visualizar: true,
		gerenciar: true,
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

// Consultoria (add-on FDE): produto Stripe separado, adicionado como 2ª line-item no
// checkout. NÃO altera as capabilities do plano — apenas marca consultoriaAtiva +
// baselineInicio na organização. Disponível apenas no ciclo mensal.
export const CONSULTORIA_ADDON = {
	name: "Gestor de Crescimento",
	description: "A gente opera a plataforma por você: dados, campanhas e relatório de resultado.",
	monthlyPrice: 500,
	currency: "BRL",
	stripePriceId: process.env.NEXT_PUBLIC_STRIPE_CONSULTORIA_MONTHLY_PRICE_ID as string,
	/* O add-on não vende software, vende o resultado: quem contrata não decide quais campanhas
	   rodar nem escreve mensagem nenhuma. Por isso os itens falam do trabalho que sai da mão do
	   lojista, não de recurso da plataforma — esses já estão listados no plano-base. */
	pricingTableFeatures: [
		{
			checked: true,
			label: "Um gestor dedicado operando a plataforma por você",
		},
		{
			checked: true,
			label: "A gente decide, escreve e ativa as campanhas",
		},
		{
			checked: true,
			label: "Templates de WhatsApp aprovados na Meta por nós",
		},
		{
			checked: true,
			label: "Segmentação e ofertas revisadas todo mês",
		},
		{
			checked: true,
			label: "Cashback e metas ajustados pelo resultado",
		},
		{
			checked: true,
			label: "Relatório mensal de receita recuperada",
		},
	],
};

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
	iaAtendimento: {
		acesso: false,
		limiteCreditos: 0,
	},
	relatoriosWhatsapp: {
		acesso: false,
	},
	erp: {
		acesso: false,
	},
};

export const DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES: TOrganizationConfiguration["preferencias"] = {
	rastreamentoEstoque: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES.erp.acesso === true,
	limiteMensagensSemanaisViaCampanhas: null,
	sessoesVenda: {
		habilitado: false,
		obrigatorio: false,
		exigirFundoTroco: false,
		conferenciaCega: false,
		bloquearFechamentoComPendenciaFiscal: false,
	},
	carteirasClientes: {
		habilitado: false,
	},
	integracaoERP: {
		fulfillment: false,
		estoque: false,
		financeiro: false,
		fiscal: false,
	},
	contasAtendimento: {
		habilitado: false,
	},
	impressoes: {
		automatica: {
			CUPOM_VENDA: { habilitada: false, canais: [], copias: 1 },
			DANFE_NFCE: { habilitada: false, canais: [], copias: 1 },
			DANFE_NFE: { habilitada: false, canais: [], copias: 1 },
		},
	},
};

const DEFAULT_PAYMENT_METHOD_CONFIGURATION: TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"]["DINHEIRO"] = {
	suportado: false,
	contaFinanceiraPadraoId: null,
	contaFinanceiraPadraoKey: null,
	contaFinanceiraEditavel: false,
	efetivacaoTipoPadrao: "IMEDIATA",
	delayDiasPadrao: 0,
	parcelamento: {
		permitido: false,
		minParcelas: 0,
		maxParcelas: null,
		intervaloMeses: null,
	},
};

export const DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS: TOrganizationDefaults = {
	contabilidade: {
		lancamentosPadrao: {
			vendas: {
				debitoContaId: null,
				debitoContaKey: null,
				creditoContaId: null,
				creditoContaKey: null,
			},
			compras: {
				debitoContaId: null,
				debitoContaKey: null,
				creditoContaId: null,
				creditoContaKey: null,
				debitoCreditoTributarioContaId: null,
				debitoCreditoTributarioContaKey: null,
				debitoDespesaPeriodoContaId: null,
				debitoDespesaPeriodoContaKey: null,
			},
			transferencias: {
				debitoContaId: null,
				debitoContaKey: null,
				creditoContaId: null,
				creditoContaKey: null,
			},
			taxasCanal: {
				debitoContaId: null,
				debitoContaKey: null,
				creditoContaId: null,
				creditoContaKey: null,
			},
			perdasEstoque: {
				debitoContaId: null,
				debitoContaKey: null,
				creditoContaId: null,
				creditoContaKey: null,
			},
		},
	},
	pagamentos: {
		metodos: {
			DINHEIRO: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			PIX: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			CARTAO_DEBITO: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			CARTAO_CREDITO: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			BOLETO: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			TRANSFERENCIA: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			CASHBACK: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			VALE: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
			A_DEFINIR: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION, efetivacaoTipoPadrao: "PENDENTE" },
			FIADO_NOTA: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION, efetivacaoTipoPadrao: "PENDENTE" },
			OUTRO: { ...DEFAULT_PAYMENT_METHOD_CONFIGURATION },
		},
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
				redirectTo: "/dashboard/growth/cashback",
			},
			"/dashboard/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/catalog/products": {
				accessible: false,
				redirectTo: "/dashboard/catalog/products",
			},
			"/dashboard/growth/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/growth/cashback": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/channels/whatsapp": {
				accessible: false,
				redirectTo: "/dashboard/growth/campaigns",
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
			iaAtendimento: {
				acesso: false,
				limiteCreditos: 0,
			},
			relatoriosWhatsapp: {
				acesso: false,
			},
			erp: {
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
			"/dashboard/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/catalog/products": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/growth/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/growth/cashback": {
				accessible: true,
				redirectTo: "/dashboard/growth/cashback",
			},
			"/dashboard/management/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/channels/whatsapp": {
				accessible: false,
				redirectTo: "/dashboard/growth/campaigns",
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
			erp: {
				acesso: false,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "BI completo de vendas, produtos e equipe",
			},
			{
				checked: true,
				label: "Integração com ERP e sincronização automática",
			},
			{
				checked: true,
				label: "Até 10 campanhas e jornadas ativas",
			},
			{
				checked: true,
				label: "Programas de cashback flexíveis",
			},
			{
				checked: true,
				label: "Ponto de Interação para acúmulo de cashback",
			},
			{
				checked: true,
				label: "Relatórios de vendas no seu WhatsApp",
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
			"/dashboard/sales": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers/segments": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/customers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/partners": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/catalog/products": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/growth/campaigns": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/growth/cashback": {
				accessible: true,
				redirectTo: "/dashboard/growth/cashback",
			},
			"/dashboard/management/sellers": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/management/goals": {
				accessible: true,
				redirectTo: null,
			},
			"/dashboard/channels/whatsapp": {
				accessible: true,
				redirectTo: null,
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
			iaAtendimento: {
				acesso: true,
				limiteCreditos: null,
			},
			erp: {
				acesso: true,
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

// Plano comercializado hoje. A separação em três tiers está deprecada: o self-serve já vende
// apenas este plano (ver components/Subscription/PlanSelectionMenu.tsx) e os deals B2B seguem a
// mesma regra — o admin não escolhe tier ao fechar um deal. Os outros tiers seguem no config
// porque organizações antigas ainda os têm gravados em `assinaturaPlano` (capabilities/paywall).
export const DEAL_PLAN_KEY: TAppSubscriptionPlanKey = "CRESCIMENTO";

// Teto do mandato PIX Automático (Stripe), em centavos. Cobre o maior combo mensal
// possível — plano ESCALA + consultoria (Gestor de Crescimento) — para que upgrade,
// downgrade ou adição da consultoria nunca exijam reautorização do débito no banco.
// PIX Automático só se aplica ao ciclo mensal (payment_schedule "monthly").
export const PIX_MANDATE_MAX_AMOUNT_CENTS = Math.round((AppSubscriptionPlans.ESCALA.pricing.monthly.price + CONSULTORIA_ADDON.monthlyPrice) * 100);

export function getOrganizationAccessToRoute({ organizationPlan, path }: { organizationPlan: keyof typeof AppSubscriptionPlans; path: string }) {
	const plan = AppSubscriptionPlans[organizationPlan];
	const route = plan.routes[path as keyof typeof plan.routes];
	if (!route) return { access: false, redirectTo: "/" };
	if (!route.accessible) return { access: false, redirectTo: route.redirectTo || "/" };
	return { access: true, redirectTo: null };
}
// `as const` deriva TAppRoutePath, que faz o mapa de ícones (config/app-route-icons)
// ser verificado pelo compilador: rota nova sem ícone não compila.
export const AppRoutes = [
	{
		path: "/dashboard",
		title: "Dashboard",
		description: "Visão geral das principais métricas do seu negócio",
	},
	{
		path: "/dashboard/sales/point-of-interaction",
		title: "Ponto de Interação",
		description: "Painel de acompanhamento e gestão do seu ponto de interação.",
	},
	{
		path: "/dashboard/sales",
		title: "Vendas",
		description: "Listagem das vendas realizadas",
	},
	{
		path: "/dashboard/sales/new",
		title: "Nova Venda",
		description: "Cadastro de nova venda.",
	},
	{
		path: "/dashboard/sales/orders",
		title: "Pedidos",
		description: "Controle de pedidos realizados.",
	},
	{
		path: "/dashboard/operations/preparation",
		title: "Preparo",
		description: "Acompanhamento dos pedidos em preparo.",
	},
	{
		path: "/dashboard/approvals",
		title: "Aprovações",
		description: "Revisão e decisão de solicitações pendentes.",
	},
	{
		path: "/dashboard/sales/service-accounts",
		title: "Mesas & Comandas",
		description: "Contas abertas por mesa ou comanda, com as rodadas em andamento.",
	},
	{
		path: "/dashboard/sales/cash-sessions",
		title: "Caixa",
		description: "Abertura, conferência e fechamento das sessões de caixa.",
	},
	{
		path: "/dashboard/customers/segments",
		title: "Segmentações",
		description: "Visualização da matriz RFM de clientes.",
	},
	{
		path: "/dashboard/customers",
		title: "Clientes",
		description: "Painel detalhadado do seu portfólio de clientes.",
	},
	{
		path: "/dashboard/management/partners",
		title: "Parceiros",
		description: "Painel detalhadado dos seus parceiros comerciais.",
	},
	{
		path: "/dashboard/catalog/products",
		title: "Produtos",
		description: "Painel detalhadado dos seus produtos.",
	},
	{
		path: "/dashboard/growth/campaigns",
		title: "Campanhas",
		description: "Painel de acompanhamento e gestão das campanhas de vendas.",
	},
	{
		path: "/dashboard/growth/cashback",
		title: "Programas de Cashback",
		description: "Painel de acompanhamento e gestão do seu programa de cashback.",
	},
	{
		path: "/dashboard/growth/coupons",
		title: "Cupons",
		description: "Painel de acompanhamento e gestão dos cupons de desconto.",
	},
	{
		path: "/dashboard/catalog/store",
		title: "Loja Digital",
		description: "Painel de acompanhamento e gestão da sua loja digital.",
	},
	{
		path: "/dashboard/growth/audiences",
		title: "Públicos",
		description: "Painel de acompanhamento e gestão de públicos.",
	},
	{
		path: "/dashboard/channels/paid-media",
		title: "Marketing",
		description: "Painel de acompanhamento e gestão de marketing.",
	},
	{
		path: "/dashboard/integrations",
		title: "Integrações",
		description: "Conexões com ERPs e canais de venda do seu negócio.",
	},
	{
		path: "/dashboard/customers/portfolios",
		title: "Carteira de Clientes",
		description: "Quem abordar, o que oferecer e por quê — sua carteira do dia.",
	},
	{
		path: "/dashboard/management/sellers",
		title: "Vendedores",
		description: "Painel detalhadado dos seus vendedores.",
	},
	{
		path: "/dashboard/management/goals",
		title: "Metas",
		description: "Painel de acompanhamento e gestão das metas de vendas.",
	},
	{
		path: "/dashboard/channels/whatsapp",
		title: "Conversas",
		description: "Hub de atendimento com os clientes.",
	},
	{
		path: "/dashboard/production",
		title: "Produções",
		description: "Painel de acompanhamento e gestão das produções do seu negócio.",
	},
	{
		path: "/dashboard/inventory",
		title: "Estoque",
		description: "Visão operacional do estoque: saldo, movimentação e lotes ativos dos seus produtos.",
	},
	{
		path: "/dashboard/inventory/lots",
		title: "Lotes de Estoque",
		description: "Painel de acompanhamento e gestão dos lotes de estoque do seu negócio.",
	},
	{
		path: "/dashboard/finance",
		title: "Financeiro",
		description: "Visão geral das finanças do seu negócio.",
	},
	{
		path: "/dashboard/finance/entries",
		title: "Lançamentos",
		description: "Lançamentos contábeis do seu negócio.",
	},
	{
		path: "/dashboard/finance/transactions",
		title: "Movimentações",
		description: "Movimentações financeiras do seu negócio.",
	},
	{
		path: "/dashboard/finance/accounts",
		title: "Contas Financeiras",
		description: "Contas financeiras do seu negócio e seus saldos.",
	},
	{
		path: "/dashboard/finance/credit-cards",
		title: "Faturas de Cartão",
		description: "Faturas dos cartões de crédito do seu negócio.",
	},
	{
		path: "/dashboard/finance/reconciliation",
		title: "Conciliação",
		description: "Conciliação bancária das contas financeiras do seu negócio.",
	},
	{
		path: "/dashboard/finance/reports/income-statement",
		title: "DRE",
		description: "Demonstrativo gerencial do resultado do exercício por competência.",
	},
	{
		path: "/dashboard/finance/reports/cash-flow",
		title: "Fluxo de Caixa",
		description: "Posição consolidada de caixa, burn, runway e projeção diária.",
	},
	{
		path: "/dashboard/finance/reports/receivables-payables",
		title: "Recebíveis & Pagáveis",
		description: "Aging de vencimentos, atrasos médios, custos de fricção e liquidez.",
	},
	{
		path: "/dashboard/fiscal",
		title: "Fiscal",
		description: "Painel de acompanhamento e gestão do seu recursos fiscais.",
	},
	{
		path: "/dashboard/purchases",
		title: "Compras",
		description: "Painel de acompanhamento e gestão das compras do seu negócio.",
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
		path: "/admin-dashboard/partnerships",
		title: "Parcerias",
		description: "Gestão de parcerias da plataforma.",
	},
	{
		path: "/admin-dashboard/community",
		title: "Comunidade",
		description: "Painel de acompanhamento e gestão da comunidade RecompraCRM.",
	},
] as const;

export type TAppRoutePath = (typeof AppRoutes)[number]["path"];

export function getAppRouteTitle(path: string) {
	const route = AppRoutes.find((route) => route.path === path);
	return route?.title || "";
}
export function getAppRouteDescription(path: string) {
	const route = AppRoutes.find((route) => route.path === path);
	return route?.description || "";
}

export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 15;

// Folga de compensação bancária após o vencimento do boleto: quem paga na véspera pode levar
// até 2 dias úteis para ter a confirmação — bloquear antes disso puniria quem pagou.
export const BOLETO_COMPENSATION_DAYS = 3;
// Validade do boleto emitido no checkout (payment_method_options.boleto.expires_after_days).
export const BOLETO_EXPIRES_AFTER_DAYS = 3;
// Teto do acesso otimista de 1ª cobrança quando não há vencimento de boleto conhecido: PIX
// aguardando confirmação, falha na leitura do voucher ou checkout anterior a estes campos.
export const PENDING_FIRST_CHARGE_FALLBACK_DAYS = 3;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

type TResolveSubscriptionAccessInput = {
	stripeStatus: TOrganizationEntity["stripeSubscriptionStatus"];
	stripeStatusChangedAt: TOrganizationEntity["stripeSubscriptionStatusUltimaAlteracao"];
	trialStart: TOrganizationEntity["periodoTesteInicio"];
	trialEnd: TOrganizationEntity["periodoTesteFim"];
	paidPeriodEnd: TOrganizationEntity["assinaturaPeriodoPagoFim"];
	provisionalAccessEnd: TOrganizationEntity["assinaturaAcessoProvisorioFim"];
};

export type TSubscriptionAccess = {
	active: boolean;
	mode: "success" | "warn" | "fail";
	reason: "PAGO" | "PROVISORIO" | "GRACE_PAST_DUE" | "TRIAL" | "TRIAL_GRACE" | "BLOQUEADO";
	/** Dias restantes do contexto do `reason` (janela provisória, grace ou trial); null quando não se aplica. */
	daysRemaining: number | null;
};

/**
 * Decisão única de acesso por assinatura — usada pela sessão (`assinaturaAtiva`) e pelo endpoint
 * de status, para que as duas nunca divirjam. Ordem: período pago confirmado → janela otimista
 * de cobrança pendente → grace de past_due → trial → bloqueio.
 *
 * `active` (Stripe) continua liberando: é o caminho do cartão e do legado sem backfill. Boleto
 * nunca depende dele — a 1ª cobrança fica `incomplete` até o pagamento compensar, e é a janela
 * provisória (data absoluta local) que libera nesse meio-tempo.
 */
export function resolveSubscriptionAccess({
	stripeStatus,
	stripeStatusChangedAt,
	trialStart,
	trialEnd,
	paidPeriodEnd,
	provisionalAccessEnd,
}: TResolveSubscriptionAccessInput): TSubscriptionAccess {
	const now = new Date();

	// 1. Período confirmado por invoice.paid — ou status active.
	if (stripeStatus === "active" || (paidPeriodEnd && now <= new Date(paidPeriodEnd))) {
		return { active: true, mode: "success", reason: "PAGO", daysRemaining: null };
	}

	// 2. Cobrança pendente dentro da janela otimista (boleto emitido / PIX aguardando).
	if (provisionalAccessEnd && now <= new Date(provisionalAccessEnd)) {
		const daysRemaining = Math.ceil((new Date(provisionalAccessEnd).getTime() - now.getTime()) / MS_PER_DAY);
		return { active: true, mode: "warn", reason: "PROVISORIO", daysRemaining };
	}

	// 2b. `incomplete` sem janela provisória (checkout anterior a estes campos): janela-teto curta
	// a partir da última mudança de status — remove o "incomplete libera para sempre" sem quebrar
	// um checkout PIX em andamento. Expirada a janela, o trial abaixo ainda pode valer (a org
	// nunca teve assinatura paga; abandonar um checkout não deve queimar o teste vigente).
	if (stripeStatus === "incomplete" && !provisionalAccessEnd) {
		const referenceDate = stripeStatusChangedAt ? new Date(stripeStatusChangedAt) : now; // sem timestamp = conservador, janela cheia
		const daysSinceChange = Math.floor((now.getTime() - referenceDate.getTime()) / MS_PER_DAY);
		const daysRemaining = PENDING_FIRST_CHARGE_FALLBACK_DAYS - daysSinceChange;
		if (daysRemaining > 0) return { active: true, mode: "warn", reason: "PROVISORIO", daysRemaining };
		return resolveTrialAccess({ trialStart, trialEnd, now }) ?? { active: false, mode: "fail", reason: "BLOQUEADO", daysRemaining: null };
	}

	// 3. past_due: grace de 15 dias a partir da mudança de status (sem resgate por trial — a org
	// já teve assinatura paga).
	if (stripeStatus === "past_due") {
		const daysSinceChange = stripeStatusChangedAt ? Math.floor((now.getTime() - new Date(stripeStatusChangedAt).getTime()) / MS_PER_DAY) : 0; // sem timestamp = conservador, acabou de mudar
		const daysRemaining = SUBSCRIPTION_GRACE_PERIOD_DAYS - daysSinceChange;
		if (daysRemaining > 0) return { active: true, mode: "warn", reason: "GRACE_PAST_DUE", daysRemaining };
		return { active: false, mode: "fail", reason: "BLOQUEADO", daysRemaining: null };
	}

	// 4. Estados terminais: sem acesso (o período pago vigente já teria retornado no passo 1).
	if (stripeStatus === "canceled" || stripeStatus === "unpaid" || stripeStatus === "incomplete_expired") {
		return { active: false, mode: "fail", reason: "BLOQUEADO", daysRemaining: null };
	}

	// 5. Sem assinatura: trial (+ grace) ou bloqueio.
	return resolveTrialAccess({ trialStart, trialEnd, now }) ?? { active: false, mode: "fail", reason: "BLOQUEADO", daysRemaining: null };
}

function resolveTrialAccess({
	trialStart,
	trialEnd,
	now,
}: {
	trialStart: TOrganizationEntity["periodoTesteInicio"];
	trialEnd: TOrganizationEntity["periodoTesteFim"];
	now: Date;
}): TSubscriptionAccess | null {
	if (!trialStart || !trialEnd) return null;

	const trialEndDate = new Date(trialEnd);
	const msUntilTrialEnd = trialEndDate.getTime() - now.getTime();

	if (msUntilTrialEnd > 0) {
		const daysRemaining = Math.ceil(msUntilTrialEnd / MS_PER_DAY);
		return { active: true, mode: daysRemaining > 7 ? "success" : "warn", reason: "TRIAL", daysRemaining };
	}

	const daysSinceTrialEnd = Math.floor(Math.abs(msUntilTrialEnd) / MS_PER_DAY);
	const daysRemaining = SUBSCRIPTION_GRACE_PERIOD_DAYS - daysSinceTrialEnd;
	if (daysRemaining > 0) return { active: true, mode: "warn", reason: "TRIAL_GRACE", daysRemaining };

	return null;
}

import type { TSubscriptionAddonEnum, TSubscriptionBasePlanEnum, TSubscriptionCycleEnum } from "@/schemas/enums";
import type { TOrganizationDefaults, TOrganizationConfiguration } from "@/schemas/organizations";
import type { TUserPermissions } from "@/schemas/users";
import { DEFAULT_SCALE_BARCODE_CONFIG } from "@/lib/pos/scale-barcode";
import { DEFAULT_SERIAL_SCALE_CONFIG } from "@/lib/pos/serial-scale-protocol";
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
		operarCaixa: true,
		movimentarCaixa: true,
		conferirCaixa: true,
		configurar: true,
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
	produtos: {
		visualizar: true,
		criar: true,
		editar: true,
		alterarPrecos: true,
	},
	estoque: {
		visualizar: true,
		movimentar: true,
		ajustar: true,
	},
	producao: {
		visualizar: true,
		criar: true,
		editar: true,
		excluir: true,
		concluir: true,
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

// Modelo comercial: dois planos-base (CRM, CRM_ERP) e adicionais sobre eles, tudo com preço fixo
// e sem limite de uso. Os três tiers antigos não são mais vendidos; continuam no config porque
// organizações e deals anteriores ainda os têm gravados em `assinaturaPlano` / `planoBase`.
export type TSubscriptionBasePlanKey = TSubscriptionBasePlanEnum;
export type TSubscriptionAddonKey = TSubscriptionAddonEnum;
export type TLegacySubscriptionPlanKey = "ESSENCIAL" | "CRESCIMENTO" | "ESCALA";
export type TAppSubscriptionPlanKey = TLegacySubscriptionPlanKey | TSubscriptionBasePlanKey;

// As chaves de `pricing` nasceram em inglês; o ciclo que trafega como dado é MENSAL/ANUAL.
export type TSubscriptionPricingKey = "monthly" | "yearly";
export const SUBSCRIPTION_CYCLE_PRICING_KEY: Record<TSubscriptionCycleEnum, TSubscriptionPricingKey> = {
	MENSAL: "monthly",
	ANUAL: "yearly",
};

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
	limiteMensagensDiariasViaCampanhas: null,
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
			TICKET_PREPARO: { habilitada: false, canais: [], copias: 1 },
			DANFE_NFCE: { habilitada: false, canais: [], copias: 1 },
			DANFE_NFE: { habilitada: false, canais: [], copias: 1 },
		},
	},
	balanca: DEFAULT_SCALE_BARCODE_CONFIG,
	balancaCaixa: DEFAULT_SERIAL_SCALE_CONFIG,
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
	CRM: {
		name: "CRM",
		description: "Cashback, campanhas no WhatsApp, segmentação de clientes e BI de vendas.",
		badgeColor: "hsl(216 62% 38%)",
		badgeForeground: "hsl(355.7 100% 97.3%)",
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
			// A caixa de entrada e o agente de IA são o adicional HUB_ATENDIMENTOS.
			hubAtendimentos: {
				acesso: false,
				limiteAtendentes: null,
			},
			iaAtendimento: {
				acesso: false,
				limiteCreditos: null,
			},
			erp: {
				acesso: false,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Programa de cashback e Ponto de Interação",
			},
			{
				checked: true,
				label: "Campanhas e jornadas automáticas no WhatsApp, sem limite",
			},
			{
				checked: true,
				label: "Segmentação RFM e públicos",
			},
			{
				checked: true,
				label: "BI completo de vendas, produtos e equipe",
			},
			{
				checked: true,
				label: "Integração com o sistema da loja",
			},
			{
				checked: true,
				label: "Relatórios de vendas no seu WhatsApp",
			},
		],
		pricing: {
			// O plano CRM cobra o mesmo price do antigo CRESCIMENTO enquanto não houver um próprio.
			monthly: {
				price: 399.9,
				currency: "BRL",
				interval: "month",
				stripePriceId: (process.env.NEXT_PUBLIC_STRIPE_CRM_MONTHLY_PLAN_PRICE_ID ??
					process.env.NEXT_PUBLIC_STRIPE_CRESCIMENTO_MONTHLY_PLAN_PRICE_ID) as string,
			},
			yearly: {
				price: 3839.9,
				currency: "BRL",
				interval: "year",
				stripePriceId: (process.env.NEXT_PUBLIC_STRIPE_CRM_YEARLY_PLAN_PRICE_ID ??
					process.env.NEXT_PUBLIC_STRIPE_CRESCIMENTO_YEARLY_PLAN_PRICE_ID) as string,
			},
		},
		color: "#24549C",
	},
	CRM_ERP: {
		name: "CRM + ERP",
		description: "Tudo do CRM, mais PDV, nota fiscal, estoque e financeiro no mesmo cadastro de clientes.",
		badgeColor: "hsl(216 62% 28%)",
		badgeForeground: "hsl(355.7 100% 97.3%)",
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
				acesso: false,
				limiteAtendentes: null,
			},
			iaAtendimento: {
				acesso: false,
				limiteCreditos: null,
			},
			erp: {
				acesso: true,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Tudo que está no plano CRM",
			},
			{
				checked: true,
				label: "PDV (frente de caixa)",
			},
			{
				checked: true,
				label: "Emissão de nota fiscal",
			},
			{
				checked: true,
				label: "Controle de estoque",
			},
			{
				checked: true,
				label: "Financeiro",
			},
			{
				checked: true,
				label: "Cardápio digital, mesas e comandas",
			},
		],
		pricing: {
			monthly: {
				price: 599.9,
				currency: "BRL",
				interval: "month",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_CRM_ERP_MONTHLY_PLAN_PRICE_ID as string,
			},
			yearly: {
				price: 5759.9,
				currency: "BRL",
				interval: "year",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_CRM_ERP_YEARLY_PLAN_PRICE_ID as string,
			},
		},
		color: "#1B3F75",
	},
};

// Planos-base à venda, na ordem em que aparecem para o lojista.
export const SUBSCRIPTION_BASE_PLAN_KEYS: TSubscriptionBasePlanKey[] = ["CRM", "CRM_ERP"];

// Teto mensal de gasto com IA (USD estimados, ver lib/ai/agent/spend.ts) gravado em
// `iaAtendimento.limiteCreditos` quando o Hub entra. Não é tier nem aparece para o lojista: é o
// freio de uso justo de um adicional de preço fixo. O maior gasto mensal de uma organização até
// nov/2026 foi de US$ 2,90.
export const HUB_AI_MONTHLY_SPEND_LIMIT_USD = 25;

type TSubscriptionAddonPricing = { price: number; currency: string; stripePriceId: string };

// Adicionais sobre o plano-base. HUB_ATENDIMENTOS é o módulo de atendimentos DESTE app (caixa de
// entrada + agente de IA) — nada a ver com o app recompracrm-chats, que divide a conta Stripe
// RECOMPRACRM (produtos chats_*). CONSULTORIA é serviço: não libera recurso, só marca
// `consultoriaAtiva`, e por isso não tem ciclo anual.
export const SUBSCRIPTION_ADDONS: {
	[key in TSubscriptionAddonKey]: {
		name: string;
		description: string;
		capabilities: Partial<TOrganizationConfiguration["recursos"]>;
		pricingTableFeatures: { checked: boolean; label: string }[];
		pricing: { monthly: TSubscriptionAddonPricing; yearly: TSubscriptionAddonPricing | null };
	};
} = {
	HUB_ATENDIMENTOS: {
		name: "Hub de Atendimentos",
		description: "A caixa de entrada do WhatsApp da loja para a equipe, com o agente de IA que responde os clientes.",
		capabilities: {
			hubAtendimentos: {
				acesso: true,
				limiteAtendentes: null,
			},
			iaAtendimento: {
				acesso: true,
				limiteCreditos: HUB_AI_MONTHLY_SPEND_LIMIT_USD,
			},
		},
		pricingTableFeatures: [
			{
				checked: true,
				label: "Caixa de entrada compartilhada no número da loja",
			},
			{
				checked: true,
				label: "Atendentes ilimitados",
			},
			{
				checked: true,
				label: "Agente de IA que consulta compras, produtos e cashback",
			},
			{
				checked: true,
				label: "A IA passa a conversa para a equipe quando precisa",
			},
		],
		pricing: {
			monthly: {
				price: 299.9,
				currency: "BRL",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_MONTHLY_PRICE_ID as string,
			},
			yearly: {
				price: 2879.9,
				currency: "BRL",
				stripePriceId: process.env.NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_YEARLY_PRICE_ID as string,
			},
		},
	},
	CONSULTORIA: {
		name: CONSULTORIA_ADDON.name,
		description: CONSULTORIA_ADDON.description,
		capabilities: {},
		pricingTableFeatures: CONSULTORIA_ADDON.pricingTableFeatures,
		pricing: {
			monthly: {
				price: CONSULTORIA_ADDON.monthlyPrice,
				currency: CONSULTORIA_ADDON.currency,
				stripePriceId: CONSULTORIA_ADDON.stripePriceId,
			},
			yearly: null,
		},
	},
};

// Adicionais na ordem em que aparecem para o lojista.
export const SUBSCRIPTION_ADDON_KEYS: TSubscriptionAddonKey[] = ["HUB_ATENDIMENTOS", "CONSULTORIA"];

// O período de teste abre o plano-base escolhido e o Hub de Atendimentos: é quando o lojista
// decide se quer o adicional. A consultoria é serviço e não entra em teste.
export const FREE_TRIAL_ADDONS: TSubscriptionAddonKey[] = ["HUB_ATENDIMENTOS"];

// Marca, no metadata da assinatura Stripe, as assinaturas do modelo plano-base + adicionais. Só
// elas têm os recursos sincronizados a partir dos itens (lib/subscriptions/entitlements.ts): uma
// assinatura sem a marca é de um tier antigo e o webhook não toca nos recursos dela.
export const SUBSCRIPTION_PRICING_MODEL_METADATA_KEY = "pricingModel";
export const SUBSCRIPTION_PRICING_MODEL_MODULAR = "MODULAR";

// Plano-base padrão dos deals B2B. O admin escolhe o plano e os adicionais ao fechar o deal.
export const DEAL_PLAN_KEY: TSubscriptionBasePlanKey = "CRM";

// Teto do mandato PIX Automático (Stripe), em centavos. Cobre o maior combo mensal possível —
// o plano-base mais caro com todos os adicionais — para que trocar de plano ou contratar um
// adicional nunca exija reautorização do débito no banco. Nunca fica abaixo do teto dos mandatos
// já emitidos (ESCALA + consultoria, R$ 1.399,90): um mandato novo com teto menor que o dos
// antigos seria uma regressão silenciosa.
// PIX Automático só se aplica ao ciclo mensal (payment_schedule "monthly").
const LEGACY_PIX_MANDATE_MAX_AMOUNT_CENTS = Math.round((AppSubscriptionPlans.ESCALA.pricing.monthly.price + CONSULTORIA_ADDON.monthlyPrice) * 100);
const MODULAR_PIX_MANDATE_MAX_AMOUNT_CENTS = Math.round(
	(Math.max(...SUBSCRIPTION_BASE_PLAN_KEYS.map((key) => AppSubscriptionPlans[key].pricing.monthly.price)) +
		SUBSCRIPTION_ADDON_KEYS.reduce((total, key) => total + SUBSCRIPTION_ADDONS[key].pricing.monthly.price, 0)) *
		100,
);
export const PIX_MANDATE_MAX_AMOUNT_CENTS = Math.max(LEGACY_PIX_MANDATE_MAX_AMOUNT_CENTS, MODULAR_PIX_MANDATE_MAX_AMOUNT_CENTS);

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
		path: "/dashboard/conversations",
		title: "Conversas",
		description: "Caixa de entrada do atendimento com os clientes.",
	},
	{
		path: "/dashboard/conversations/board",
		title: "Quadro de conversas",
		description: "Atendimentos organizados por etapa, do primeiro contato ao encerramento.",
	},
	{
		path: "/dashboard/conversations/stats",
		title: "Estatísticas de conversas",
		description: "Volume, tempo de resposta e desempenho do atendimento.",
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
		path: "/dashboard/inventory/reports",
		title: "Relatórios de Estoque",
		description: "Curva ABC, giro, reposição, estoque parado, custos, perdas e vencimentos do seu estoque.",
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
		path: "/dashboard/finance/store-credit",
		title: "Fiados",
		description: "Acompanhamento e recebimento das vendas a prazo por cliente.",
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

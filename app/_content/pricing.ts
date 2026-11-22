import { AppSubscriptionPlans, FREE_TRIAL_DURATION_DAYS, SUBSCRIPTION_ADDONS } from "@/config";

// Fonte única dos preços públicos (landing #planos e /pricing). Os valores vêm do config de
// assinatura, o mesmo que o checkout cobra: dois planos-base (CRM e CRM + ERP) e dois adicionais
// que entram em qualquer um deles — o Hub de Atendimentos e o Gestor de Crescimento, este só no
// ciclo mensal. Preço fixo por loja, sem limite de campanhas, clientes, usuários ou atendentes.

const CRM_PLAN = AppSubscriptionPlans.CRM;
const ERP_PLAN = AppSubscriptionPlans.CRM_ERP;
const HUB_ADDON = SUBSCRIPTION_ADDONS.HUB_ATENDIMENTOS;
const CONSULTORIA = SUBSCRIPTION_ADDONS.CONSULTORIA;

const MONTHS_IN_YEAR = 12;

export const PRICING = {
	platformMonthly: CRM_PLAN.pricing.monthly.price,
	platformYearly: CRM_PLAN.pricing.yearly.price,
	erpMonthly: ERP_PLAN.pricing.monthly.price,
	erpYearly: ERP_PLAN.pricing.yearly.price,
	hubMonthly: HUB_ADDON.pricing.monthly.price,
	consultoriaMonthly: CONSULTORIA.pricing.monthly.price,
	// CRM operado pela nossa equipe: o combo que a landing apresenta.
	bundleMonthly: CRM_PLAN.pricing.monthly.price + CONSULTORIA.pricing.monthly.price,
	trialDays: FREE_TRIAL_DURATION_DAYS,
};

/** Equivalente mensal do plano anual e a economia sobre 12 mensalidades, como no PlanPicker do app. */
export const PLATFORM_YEARLY_MONTHLY_EQUIVALENT = PRICING.platformYearly / MONTHS_IN_YEAR;
export const ERP_YEARLY_MONTHLY_EQUIVALENT = PRICING.erpYearly / MONTHS_IN_YEAR;
export const PLATFORM_YEARLY_SAVINGS_PERCENT = Math.round((1 - PRICING.platformYearly / (PRICING.platformMonthly * MONTHS_IN_YEAR)) * 100);

export function formatPlanPrice(value: number) {
	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Preços já formatados, para o texto corrido das páginas (FAQ, chamadas). */
export const PRICE_LABELS = {
	crmMonthly: `R$ ${formatPlanPrice(PRICING.platformMonthly)}`,
	erpMonthly: `R$ ${formatPlanPrice(PRICING.erpMonthly)}`,
	hubMonthly: `R$ ${formatPlanPrice(PRICING.hubMonthly)}`,
	consultoriaMonthly: `R$ ${formatPlanPrice(PRICING.consultoriaMonthly)}`,
	bundleMonthly: `R$ ${formatPlanPrice(PRICING.bundleMonthly)}`,
};

export const PLATFORM_INCLUDED = [
	"Ponto de Interação (tablet + QR Code)",
	"Programa de cashback configurável",
	"WhatsApp automático ilimitado",
	"Campanhas com filtro de audiência",
	"Painel de clientes em risco (RFM)",
	"Business Intelligence de vendas",
	"Suporte humano incluso",
];

export const ERP_INCLUDED = [
	"PDV (frente de caixa)",
	"Emissão de nota fiscal",
	"Controle de estoque",
	"Financeiro",
	"Cardápio digital, mesas e comandas",
	"Implantação acompanhada",
];

export const HUB_INCLUDED = HUB_ADDON.pricingTableFeatures.map((feature) => feature.label);

export const CONSULTORIA_INCLUDED = [
	"Um gestor de crescimento dedicado ao seu negócio",
	"Importação e integração dos seus dados de venda",
	"Criação e gestão das suas campanhas, ponta a ponta",
	"Diagnóstico inicial com metas definidas junto com você",
	"Relatório de resultado e acompanhamento todo mês",
];

export const PRICING_GUARANTEES = ["Sem cartão de crédito para testar", "Cancele quando quiser", "Sem taxa de setup", "LGPD: dados protegidos"];

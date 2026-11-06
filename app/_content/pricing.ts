import { AppSubscriptionPlans, CONSULTORIA_ADDON, DEAL_PLAN_KEY, FREE_TRIAL_DURATION_DAYS } from "@/config";

// Fonte única dos preços públicos (landing #planos e /pricing). Os valores vêm do config de
// assinatura, o mesmo que o checkout cobra: o plano comercializado hoje (DEAL_PLAN_KEY, CRESCIMENTO)
// e o add-on Gestor de Crescimento, que só existe no ciclo mensal.
//
// O que NÃO está no plano-base: a caixa de entrada compartilhada e o agente de IA
// (`hubAtendimentos` desligado no CRESCIMENTO) são adicionais liberados sob consulta, e o ERP é
// proposta sob medida. O limite de campanhas ativas do plano não é divulgado.

const BASE_PLAN = AppSubscriptionPlans[DEAL_PLAN_KEY];

export const PRICING = {
	platformMonthly: BASE_PLAN.pricing.monthly.price,
	platformYearly: BASE_PLAN.pricing.yearly.price,
	consultoriaMonthly: CONSULTORIA_ADDON.monthlyPrice,
	bundleMonthly: BASE_PLAN.pricing.monthly.price + CONSULTORIA_ADDON.monthlyPrice,
	trialDays: FREE_TRIAL_DURATION_DAYS,
};

/** Equivalente mensal do plano anual e a economia sobre 12 mensalidades, como no PlanPicker do app. */
export const PLATFORM_YEARLY_MONTHLY_EQUIVALENT = PRICING.platformYearly / 12;
export const PLATFORM_YEARLY_SAVINGS_PERCENT = Math.round((1 - PRICING.platformYearly / (PRICING.platformMonthly * 12)) * 100);

export function formatPlanPrice(value: number) {
	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const PLATFORM_INCLUDED = [
	"Ponto de Interação (tablet + QR Code)",
	"Programa de cashback configurável",
	"WhatsApp automático ilimitado",
	"Campanhas com filtro de audiência",
	"Painel de clientes em risco (RFM)",
	"Business Intelligence de vendas",
	"Suporte humano incluso",
];

export const CONSULTORIA_INCLUDED = [
	"Um gestor de crescimento dedicado ao seu negócio",
	"Importação e integração dos seus dados de venda",
	"Criação e gestão das suas campanhas, ponta a ponta",
	"Diagnóstico inicial com metas definidas junto com você",
	"Relatório de resultado e acompanhamento todo mês",
];

export const PRICING_GUARANTEES = ["Sem cartão de crédito para testar", "Cancele quando quiser", "Sem taxa de setup", "LGPD: dados protegidos"];

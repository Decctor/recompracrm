export const PLATFORM_PARTNER_COOKIE_NAME = "recompra_partner_indicator";
export const PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const PLATFORM_PARTNER_COMMISSION_RULE_VERSION = "2026-11-addon-flat-rate";
export const PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS = 10000;
export const PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS = 10000;
export const PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS = 2000;
export const PLATFORM_PARTNER_YEARLY_INVOICE_BPS = 2700;
// Adicionais comissionáveis (Hub de Atendimentos): taxa fixa desde o primeiro invoice, no mensal e
// no anual, fora da regra de bônus do plano-base. O adicional entra e sai sem cancelar a
// assinatura e tem custo de IA por conversa — bônus de 100% nele pagaria por algo fácil de desfazer.
export const PLATFORM_PARTNER_ADDON_INVOICE_BPS = 2000;

export const PLATFORM_PARTNER_RULE_SNAPSHOT = {
	version: PLATFORM_PARTNER_COMMISSION_RULE_VERSION,
	attribution: {
		cookieDays: 30,
		clickModel: "LAST_CLICK",
		manualCodePriority: true,
	},
	commission: {
		monthly: {
			firstInvoiceBps: PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS,
			thirdInvoiceBps: PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS,
			subsequentInvoiceBps: PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS,
		},
		yearly: {
			invoiceBps: PLATFORM_PARTNER_YEARLY_INVOICE_BPS,
		},
		addons: {
			invoiceBps: PLATFORM_PARTNER_ADDON_INVOICE_BPS,
		},
		base: "GROSS_SAAS_BASE_PLAN_EXCLUDING_ADDONS_AND_CONSULTORIA",
	},
} as const;

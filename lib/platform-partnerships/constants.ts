export const PLATFORM_PARTNER_COOKIE_NAME = "recompra_partner_indicator";
export const PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const PLATFORM_PARTNER_COMMISSION_RULE_VERSION = "2026-06-third-invoice-bonus";
export const PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS = 10000;
export const PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS = 10000;
export const PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS = 2000;
export const PLATFORM_PARTNER_YEARLY_INVOICE_BPS = 2700;

// Dia do mês em que o PIX das comissões cai. O PIX do dia 10 do mês M paga toda comissão não paga e
// não cancelada cuja elegibilidade (fatura + 30 dias) caiu até o último dia do mês M-1.
export const PLATFORM_PARTNER_PAYOUT_DAY = 10;
// Faturas somadas no "Em 12 meses" do detalhe da loja (plano mensal).
export const PLATFORM_PARTNER_PROJECTION_INVOICES = 12;

/** Percentual da comissão de uma fatura. Fonte única para o webhook do Stripe e para as projeções do painel. */
export function getPlatformPartnerCommissionBps({ numeroInvoiceAssinatura, anual }: { numeroInvoiceAssinatura: number; anual: boolean }) {
	if (anual) return PLATFORM_PARTNER_YEARLY_INVOICE_BPS;
	if (numeroInvoiceAssinatura === 1) return PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS;
	if (numeroInvoiceAssinatura === 3) return PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS;
	return PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS;
}

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
		base: "GROSS_SAAS_PLAN_EXCLUDING_CONSULTORIA",
	},
} as const;

// Canal do financeiro para dúvidas de pagamento ("Fale com o financeiro" no detalhe do PIX). Mesmo número público do site.
export const PLATFORM_PARTNER_FINANCE_WHATSAPP_NUMBER = "553499480791";

/** Link de indicação público do parceiro. */
export function getPlatformPartnerReferralLink(codigo: string) {
	const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.recompracrm.com.br").replace(/\/$/, "");
	return `${appUrl}/r/${codigo}`;
}

/** Mensagem padrão do kit de divulgação; `{link}` vira o link de indicação. */
export const PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE =
	"Oi! Uso e recomendo o RecompraCRM para fazer o cliente voltar à loja com cashback e WhatsApp. Testa grátis por aqui: {link}";

export function buildPlatformPartnerShareMessage({ mensagem, link }: { mensagem: string | null | undefined; link: string }) {
	const template = mensagem?.trim() ? mensagem : PLATFORM_PARTNER_DEFAULT_SHARE_MESSAGE;
	return template.includes("{link}") ? template.replaceAll("{link}", link) : `${template} ${link}`;
}

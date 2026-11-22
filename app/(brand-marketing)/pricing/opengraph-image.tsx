import { PRICING, formatPlanPrice } from "@/app/_content/pricing";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Preços do RecompraCRM";

// O número é o preço do plano CRM, lido do mesmo config que o checkout cobra.
export default async function PricingOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "Preços",
		title: "Um preço fixo por loja. Sem limite de uso.",
		stat: `R$ ${formatPlanPrice(PRICING.platformMonthly)}`,
		statLabel: `por mês no plano CRM, com ${PRICING.trialDays} dias grátis e sem cartão de crédito`,
		footer: "recompracrm.com.br/pricing",
	});
}

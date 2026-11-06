import { PRICING, formatPlanPrice } from "@/app/_content/pricing";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Preços do RecompraCRM";

// O número é o preço do plano Plataforma, lido do mesmo config que o checkout cobra.
export default async function PricingOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "Preços",
		title: "Um preço por mês. A mesma plataforma nos dois planos.",
		stat: `R$ ${formatPlanPrice(PRICING.platformMonthly)}`,
		statLabel: `por mês no plano Plataforma, com ${PRICING.trialDays} dias grátis e sem cartão de crédito`,
		footer: "recompracrm.com.br/pricing",
	});
}

import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { WHATSAPP_PRICES } from "@/lib/marketing-tools/whatsapp-cost";
import { formatUnitPrice } from "../_components/format";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Calculadora de custo do WhatsApp do RecompraCRM";

export default async function WhatsappCostOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "Ferramenta gratuita",
		title: "Quanto custam as suas campanhas no WhatsApp",
		stat: formatUnitPrice(WHATSAPP_PRICES.MARKETING.brl),
		statLabel: "por mensagem de marketing na tabela da Meta para o Brasil",
		footer: "recompracrm.com.br/tools",
	});
}

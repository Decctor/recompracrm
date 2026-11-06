import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Sistema de CRM para varejo — RecompraCRM";

// O número são os segmentos RFM em que a base é reclassificada todo dia (utils/rfm.ts).
export default async function CrmForRetailOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "CRM para varejo",
		title: "Sistema de CRM para varejo, feito para o cliente voltar.",
		stat: "11",
		statLabel: "segmentos RFM recalculados todo dia, com campanhas no WhatsApp para cada um",
		footer: "recompracrm.com.br/solutions/crm-para-varejo",
	});
}

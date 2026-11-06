import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Cardápio digital do RecompraCRM — pedido, entrega e cashback, sem comissão";

// O número é a promessa que o diferencia do marketplace: nenhuma taxa sobre o pedido.
export default async function ErpDigitalMenuOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "ERP · Cardápio digital",
		title: "Cardápio digital com pedido, sem comissão.",
		stat: "0%",
		statLabel: "de comissão por pedido, com o cliente na sua base e cashback no checkout",
		footer: "recompracrm.com.br/erp/cardapio-digital",
	});
}

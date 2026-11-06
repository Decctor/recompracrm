import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "PDV do RecompraCRM — a frente de caixa que já fideliza";

// O número é o fluxo da seção "Uma venda no balcão": do bipe à nota em quatro passos.
export default async function ErpPdvOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "ERP · PDV",
		title: "Sistema PDV: a frente de caixa que já fideliza.",
		stat: "4 passos",
		statLabel: "do bipe à NFC-e, com estoque, financeiro e cashback lançados sozinhos",
		footer: "recompracrm.com.br/erp/pdv",
	});
}

import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Controle de estoque do RecompraCRM — baixa automática, entrada por XML, lotes e validade";

// O número são os relatórios de estoque do app (reports-page.tsx): do resumo aos vencimentos.
export default async function ErpStockOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "ERP · Controle de estoque",
		title: "Controle de estoque que se atualiza a cada venda.",
		stat: "8",
		statLabel: "relatórios de estoque, da curva ABC ao ponto de pedido e aos vencimentos",
		footer: "recompracrm.com.br/erp/estoque",
	});
}

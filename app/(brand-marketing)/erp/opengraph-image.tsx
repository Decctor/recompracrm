import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "ERP RecompraCRM — venda, emita nota e fidelize no mesmo sistema";

// O número é a tese da seção "Depois de finalizar": uma venda confirmada já sai com tudo lançado.
export default async function ErpOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "ERP RecompraCRM",
		title: "Venda, emita nota e fidelize no mesmo sistema.",
		stat: "1 venda",
		statLabel: "e o sistema lança contabilidade, pagamentos, nota fiscal, estoque e cashback",
		footer: "recompracrm.com.br/erp",
	});
}

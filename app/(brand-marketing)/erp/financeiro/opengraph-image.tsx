import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Financeiro do RecompraCRM — fluxo de caixa, contas a pagar e receber e conciliação bancária";

// O número é o horizonte máximo do fluxo de caixa projetado (cash-flow-page.tsx: 30, 60 ou 90 dias).
export default async function ErpFinanceOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "ERP · Financeiro",
		title: "Controle financeiro que a venda já preenche.",
		stat: "90 dias",
		statLabel: "de fluxo de caixa projetado com o que já está a receber e a pagar",
		footer: "recompracrm.com.br/erp/financeiro",
	});
}

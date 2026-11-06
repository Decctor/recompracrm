import { Dock } from "@/app/_components/Dock";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { ErpContact } from "../_components/ErpContact";
import { ErpFooter } from "../_components/ErpFooter";
import { PdvFaq } from "./_components/PdvFaq";
import { PdvHero } from "./_components/PdvHero";
import { PdvCashSession, PdvCashback, PdvErpModules, PdvFeatures, PdvSaleSteps } from "./_components/PdvSections";
import { PDV_FAQS, PDV_PATH } from "./_components/pdv-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Sistema PDV para loja: frente de caixa com NFC-e e cashback";
const description =
	"PDV no navegador com leitor de código de barras, balança, maquininha Stone, NFC-e e fechamento de caixa com conferência cega. Cada venda baixa o estoque, lança no financeiro e credita o cashback do cliente.";

export const metadata: Metadata = {
	title,
	description,
	alternates: { canonical: PDV_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${PDV_PATH}`,
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: `${title} | RecompraCRM`,
		description,
	},
};

const breadcrumbJsonLd = {
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: [
		{ "@type": "ListItem", position: 1, name: "RecompraCRM", item: BASE_URL },
		{ "@type": "ListItem", position: 2, name: "ERP", item: `${BASE_URL}/erp` },
		{ "@type": "ListItem", position: 3, name: "PDV", item: `${BASE_URL}${PDV_PATH}` },
	],
};

export default function ErpPdvPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(PDV_FAQS)]) }} />
			<Dock variant="erp" />
			<main>
				<PdvHero />
				<PdvSaleSteps />
				<PdvFeatures />
				<PdvCashSession />
				<PdvCashback />
				<PdvErpModules />
				<PdvFaq />
				<ErpContact />
			</main>
			<ErpFooter />
		</div>
	);
}

import { Dock } from "@/app/_components/Dock";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { ErpContact } from "../_components/ErpContact";
import { ErpFooter } from "../_components/ErpFooter";
import { StockFaq } from "./_components/StockFaq";
import { StockHero } from "./_components/StockHero";
import { StockComparison, StockDeduction, StockErpModules, StockInbound, StockLots, StockRecount, StockReports } from "./_components/StockSections";
import { STOCK_FAQS, STOCK_PATH } from "./_components/stock-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Controle de estoque para loja: sistema com XML, lotes e validade";
const description =
	"Sistema de controle de estoque integrado ao PDV: a venda baixa o saldo, a nota do fornecedor entra pelo XML, lotes com validade saem na ordem certa e o ponto de pedido mostra o que comprar.";

export const metadata: Metadata = {
	title,
	description,
	keywords: [
		"controle de estoque",
		"gestão de estoque",
		"sistema de controle de estoque",
		"inventário de estoque",
		"estoque mínimo",
		"planilha de controle de estoque",
	],
	alternates: { canonical: STOCK_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${STOCK_PATH}`,
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
		{ "@type": "ListItem", position: 3, name: "Controle de estoque", item: `${BASE_URL}${STOCK_PATH}` },
	],
};

export default function ErpStockPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(STOCK_FAQS)]) }} />
			<Dock variant="erp" />
			<main>
				<StockHero />
				<StockDeduction />
				<StockInbound />
				<StockLots />
				<StockRecount />
				<StockReports />
				<StockComparison />
				<StockErpModules />
				<StockFaq />
				<ErpContact />
			</main>
			<ErpFooter />
		</div>
	);
}

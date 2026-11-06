import { Dock } from "@/app/_components/Dock";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { ErpContact } from "../_components/ErpContact";
import { ErpFooter } from "../_components/ErpFooter";
import { MenuFaq } from "./_components/MenuFaq";
import { MenuHero } from "./_components/MenuHero";
import { MenuCashback, MenuComparison, MenuErpModules, MenuFeatures, MenuOrderSteps, MenuStoreSide } from "./_components/MenuSections";
import { MENU_FAQS, MENU_PATH } from "./_components/menu-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Cardápio digital com pedido, entrega e cashback, sem comissão";
const description =
	"Cardápio digital com o link da sua loja: pedido para entrega ou retirada, adicionais, taxa de entrega e horários. Sem comissão por pedido, com quadro de pedidos, acompanhamento pelo cliente e cashback no checkout.";

export const metadata: Metadata = {
	title,
	description,
	keywords: ["cardápio digital", "cardápio online", "como fazer cardápio digital", "menu digital", "cardápio digital para restaurante"],
	alternates: { canonical: MENU_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${MENU_PATH}`,
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
		{ "@type": "ListItem", position: 3, name: "Cardápio digital", item: `${BASE_URL}${MENU_PATH}` },
	],
};

export default function ErpDigitalMenuPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(MENU_FAQS)]) }} />
			<Dock variant="erp" />
			<main>
				<MenuHero />
				<MenuOrderSteps />
				<MenuFeatures />
				<MenuStoreSide />
				<MenuCashback />
				<MenuComparison />
				<MenuErpModules />
				<MenuFaq />
				<ErpContact />
			</main>
			<ErpFooter />
		</div>
	);
}

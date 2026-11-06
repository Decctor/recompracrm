import { Dock } from "@/app/_components/Dock";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { ErpContact } from "../_components/ErpContact";
import { ErpFooter } from "../_components/ErpFooter";
import {
	FinanceCashFlow,
	FinanceComparison,
	FinanceDre,
	FinanceErpModules,
	FinanceFaq,
	FinanceHero,
	FinancePayables,
	FinanceReconciliation,
	FinanceSources,
} from "./_components/FinanceSections";
import { FINANCE_FAQS, FINANCE_PATH } from "./_components/finance-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Controle financeiro para loja: fluxo de caixa, contas e conciliação";
const description =
	"Sistema financeiro integrado ao PDV: contas a receber nascem da venda, contas a pagar da compra, a conciliação bancária sugere cada lançamento do extrato e o fluxo de caixa é projetado para 90 dias. DRE gerencial por competência.";

export const metadata: Metadata = {
	title,
	description,
	keywords: [
		"controle financeiro",
		"fluxo de caixa",
		"conciliação bancária",
		"contas a pagar e receber",
		"sistema financeiro",
		"planilha de fluxo de caixa",
	],
	alternates: { canonical: FINANCE_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${FINANCE_PATH}`,
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
		{ "@type": "ListItem", position: 3, name: "Financeiro", item: `${BASE_URL}${FINANCE_PATH}` },
	],
};

export default function ErpFinancePage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(FINANCE_FAQS)]) }} />
			<Dock variant="erp" />
			<main>
				<FinanceHero />
				<FinanceSources />
				<FinanceReconciliation />
				<FinanceCashFlow />
				<FinancePayables />
				<FinanceDre />
				<FinanceComparison />
				<FinanceErpModules />
				<FinanceFaq />
				<ErpContact />
			</main>
			<ErpFooter />
		</div>
	);
}

import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { CrmCampaigns, CrmCta, CrmDefinition, CrmFaq, CrmHero, CrmInbox, CrmProfile, CrmSources, CrmTeam } from "./_components/CrmSections";
import { CRM_FAQS, CRM_PATH } from "./_components/crm-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Sistema de CRM para varejo: clientes, WhatsApp e recompra";
const description =
	"Sistema de CRM para loja física: a base de clientes se forma a cada venda, a matriz RFM mostra quem está esfriando e as campanhas no WhatsApp trazem o cliente de volta. Teste 15 dias grátis.";

export const metadata: Metadata = {
	title,
	description,
	keywords: ["sistema de crm", "crm para varejo", "crm whatsapp", "crm para whatsapp", "crm para pequenas empresas", "crm para lojas"],
	alternates: { canonical: CRM_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${CRM_PATH}`,
		type: "article",
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
		{ "@type": "ListItem", position: 2, name: "CRM para varejo", item: `${BASE_URL}${CRM_PATH}` },
	],
};

export default function CrmForRetailPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(CRM_FAQS)]) }} />
			<Dock variant="product" />
			<main>
				<CrmHero />
				<CrmDefinition />
				<CrmSources />
				<CrmProfile />
				<CrmCampaigns />
				<CrmInbox />
				<CrmTeam />
				<CrmFaq />
				<CrmCta />
			</main>
			<MarketingFooter />
		</div>
	);
}

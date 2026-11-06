import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import {
	LoyaltyCta,
	LoyaltyDefinition,
	LoyaltyDigitalCard,
	LoyaltyFaq,
	LoyaltyHero,
	LoyaltyModels,
	LoyaltyProof,
	LoyaltyRewards,
	LoyaltySegments,
	LoyaltySteps,
} from "./_components/LoyaltySections";
import { LOYALTY_FAQS, LOYALTY_PATH } from "./_components/loyalty-content";

const BASE_URL = "https://www.recompracrm.com.br";
const title = "Programa de fidelidade para loja: como criar o seu com cashback";
const description =
	"Como montar um programa de fidelidade para loja física: carimbo, pontos, cashback ou clube, a regra certa para a sua margem e o cartão fidelidade digital pelo telefone, sem aplicativo. Teste 15 dias grátis.";

export const metadata: Metadata = {
	title,
	description,
	alternates: { canonical: LOYALTY_PATH },
	openGraph: {
		title: `${title} | RecompraCRM`,
		description,
		url: `${BASE_URL}${LOYALTY_PATH}`,
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
		{ "@type": "ListItem", position: 2, name: "Programa de fidelidade", item: `${BASE_URL}${LOYALTY_PATH}` },
	],
};

export default function LoyaltyProgramPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, buildFAQPageJsonLd(LOYALTY_FAQS)]) }} />
			<Dock variant="product" />
			<main>
				<LoyaltyHero />
				<LoyaltyDefinition />
				<LoyaltyModels />
				<LoyaltySteps />
				<LoyaltyDigitalCard />
				<LoyaltyRewards />
				<LoyaltySegments />
				<LoyaltyProof />
				<LoyaltyFaq />
				<LoyaltyCta />
			</main>
			<MarketingFooter />
		</div>
	);
}

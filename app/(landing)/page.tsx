import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { Dock } from "@/app/_components/Dock";
import LandingAnalyticsTracker from "@/app/_components/LandingAnalyticsTracker";
import { LandingCases } from "@/app/_components/landing/Cases";
import { LandingCashback } from "@/app/_components/landing/Cashback";
import { LandingClosingCta, LandingFooter } from "@/app/_components/landing/Closing";
import { LandingErp } from "@/app/_components/landing/Erp";
import { LANDING_FAQS, LandingFaq } from "@/app/_components/landing/Faq";
import { LandingHero } from "@/app/_components/landing/Hero";
import { LandingIntegrations } from "@/app/_components/landing/Integrations";
import { LandingPricing } from "@/app/_components/landing/Pricing";
import { LandingTrust } from "@/app/_components/landing/Trust";
import { LandingTwoFronts } from "@/app/_components/landing/TwoFronts";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "RecompraCRM — Faça seus clientes voltarem no automático",
	description:
		"CRM de recompra para o varejo: cashback no balcão, campanhas automáticas no WhatsApp oficial da loja e alerta de clientes em risco. 15 dias grátis, sem cartão.",
	alternates: { canonical: "/" },
	// Sem `images`: o cartão usa o opengraph-image.tsx deste grupo em vez do /og-image.png do layout.
	twitter: {
		card: "summary_large_image",
		title: "RecompraCRM — Faça seus clientes voltarem no automático",
		description:
			"CRM de recompra para o varejo: cashback no balcão, campanhas automáticas no WhatsApp oficial da loja e alerta de clientes em risco. 15 dias grátis, sem cartão.",
	},
};

export default function LandingPage() {
	const faqJsonLd = buildFAQPageJsonLd(LANDING_FAQS);

	return (
		<div className="min-h-screen bg-white font-outfit leading-[normal] text-[#0e1214] tabular-nums antialiased selection:bg-[#24549c]/15">
			{/* JSON-LD FAQPage */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
			<LandingAnalyticsTracker />
			<Dock variant="landing" />
			<main>
				<LandingHero />
				<LandingTwoFronts />
				<LandingCashback />
				<LandingErp />
				<LandingCases />
				<LandingIntegrations />
				<LandingTrust />
				<LandingPricing />
				<LandingFaq />
				<LandingClosingCta />
			</main>
			<LandingFooter />
		</div>
	);
}

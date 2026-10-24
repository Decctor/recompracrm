import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { Dock } from "./_components/Dock";
import LandingAnalyticsTracker from "./_components/LandingAnalyticsTracker";
import { LandingCases } from "./_components/landing/Cases";
import { LandingCashback } from "./_components/landing/Cashback";
import { LandingClosingCta, LandingFooter } from "./_components/landing/Closing";
import { LandingErp } from "./_components/landing/Erp";
import { LANDING_FAQS, LandingFaq } from "./_components/landing/Faq";
import { LandingHero } from "./_components/landing/Hero";
import { LandingIntegrations } from "./_components/landing/Integrations";
import { LandingPricing } from "./_components/landing/Pricing";
import { LandingTrust } from "./_components/landing/Trust";
import { LandingTwoFronts } from "./_components/landing/TwoFronts";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "RecompraCRM — Faça seus clientes voltarem no automático",
	description:
		"CRM de recompra para o varejo: cashback no balcão, campanhas automáticas no WhatsApp oficial da loja e alerta de clientes em risco. 15 dias grátis, sem cartão.",
	alternates: { canonical: "/" },
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

import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import "./_components/ledger/ledger.css";
import LandingAnalyticsTracker from "./_components/LandingAnalyticsTracker";
import ReferralLinkNotice from "./_components/ReferralLinkNotice";
import { LedgerCases } from "./_components/ledger/cases/Cases";
import { LANDING_FAQS, LedgerFAQ } from "./_components/ledger/FAQ";
import { LedgerClosingCTA, LedgerFooter } from "./_components/ledger/Footer";
import { LedgerFeatures } from "./_components/ledger/Features";
import { LedgerHero } from "./_components/ledger/Hero";
import { LedgerHowItWorks } from "./_components/ledger/HowItWorks";
import { LedgerIntegrations } from "./_components/ledger/Integrations";
import { LedgerNavbar } from "./_components/ledger/Navbar";
import { LedgerPricing } from "./_components/ledger/Pricing";
import { LedgerProblem } from "./_components/ledger/Problem";
import { LedgerTrust } from "./_components/ledger/Trust";
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
		<div className="min-h-screen bg-[#fafaf7] text-[#171717] selection:bg-[#ffb900]/35 selection:text-[#171717]">
			{/* JSON-LD FAQPage */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
			<LandingAnalyticsTracker />
			<ReferralLinkNotice />
			<LedgerNavbar />
			<main>
				<LedgerHero />
				<LedgerProblem />
				<LedgerHowItWorks />
				<LedgerCases />
				<LedgerFeatures />
				<LedgerIntegrations />
				<LedgerTrust />
				<LedgerPricing />
				<LedgerFAQ />
				<LedgerClosingCTA />
			</main>
			<LedgerFooter />
		</div>
	);
}

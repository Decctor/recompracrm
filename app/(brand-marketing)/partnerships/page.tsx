import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";
import type { Metadata } from "next";
import { PartnersCalculator } from "./_components/PartnersCalculator";
import { PartnersClosingCTA } from "./_components/PartnersClosingCTA";
import { PartnersForWho } from "./_components/PartnersForWho";
import { PartnersHero } from "./_components/PartnersHero";
import { PartnersHowItWorks } from "./_components/PartnersHowItWorks";
import { PartnersPayment } from "./_components/PartnersPayment";
import { FIRST_INVOICE_PERCENT, SUBSEQUENT_INVOICE_PERCENT, THIRD_INVOICE_PERCENT } from "./_components/program-facts";

export const metadata: Metadata = {
	title: "Programa de Parcerias | RecompraCRM",
	description: `Indique lojas para o RecompraCRM e ganhe comissão recorrente: ${FIRST_INVOICE_PERCENT}% da primeira e ${THIRD_INVOICE_PERCENT}% da terceira mensalidade, mais ${SUBSEQUENT_INVOICE_PERCENT}% das demais, com painel próprio e pagamento mensal via PIX.`,
	openGraph: {
		title: "Programa de Parcerias | RecompraCRM",
		description: "Transforme suas indicações de lojistas em receita recorrente. Painel próprio e pagamento mensal via PIX.",
	},
};

export default function PartnerProgramPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<Dock variant="partners" />
			<main>
				<PartnersHero />
				<PartnersHowItWorks />
				<PartnersPayment />
				<PartnersCalculator />
				<PartnersForWho />
				<PartnersClosingCTA />
			</main>
			<MarketingFooter bordered={false} />
		</div>
	);
}

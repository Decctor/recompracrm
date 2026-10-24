import { INTEGRATION_PAGES } from "@/app/_content/integration-pages";
import { IntegrationCard } from "@/components/Content/Integration/IntegrationCard";
import type { Metadata } from "next";
import { IntegrationsHubHero } from "./_components/IntegrationsHubHero";

const BASE_URL = "https://www.recompracrm.com.br";

export const metadata: Metadata = {
	title: "Integrações — Conecte seu ERP, PDV ou e-commerce ao RecompraCRM",
	description:
		"Conecte Bling, Cardápio Web, Online Software, Nuvem Shop e iFood ao RecompraCRM. Importe vendas, clientes e produtos automaticamente e ative cashback, RFM e campanhas de WhatsApp.",
	alternates: { canonical: `${BASE_URL}/integrations` },
	openGraph: {
		title: "Integrações RecompraCRM — ERP, PDV e e-commerce",
		description: "Importe vendas, clientes e produtos automaticamente e transforme cada venda em recompra.",
		url: `${BASE_URL}/integrations`,
		type: "website",
	},
};

export default function IntegrationsHubPage() {
	const itemListJsonLd = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		itemListElement: INTEGRATION_PAGES.map((integration, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: `Integração ${integration.name}`,
			url: `${BASE_URL}/integrations/${integration.slug}`,
		})),
	};

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

			<main>
				<IntegrationsHubHero integrations={INTEGRATION_PAGES} />

				<section id="conectores" className="scroll-mt-[60px] pt-20 pb-24 sm:pt-28 sm:pb-[120px]">
					<div className="mx-auto max-w-[1240px] px-6">
						<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
							<h2 className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">Conectores disponíveis</h2>
							<span className="text-[15px] leading-[normal] text-[#687a80]">{INTEGRATION_PAGES.length} conectores</span>
						</div>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] gap-6">
							{INTEGRATION_PAGES.map((integration) => (
								<IntegrationCard key={integration.slug} integration={integration} />
							))}
						</div>
					</div>
				</section>
			</main>
		</>
	);
}

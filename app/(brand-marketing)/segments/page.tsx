import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import type { Metadata } from "next";
import { HUB_WHATSAPP_MESSAGE } from "./_components/segment-families";
import { SegmentGroups, SegmentsHubHero } from "./_components/SegmentsHub";
import { SegmentsCta } from "./_components/SegmentsCta";

const BASE_URL = "https://www.recompracrm.com.br";

export const metadata: Metadata = {
	title: "Programa de Fidelidade por Segmento",
	description:
		"Cashback, campanhas no WhatsApp e análise RFM aplicados à realidade de cada tipo de loja: restaurantes, pet shops, farmácias, moda e mais. Encontre o seu segmento.",
	alternates: { canonical: `${BASE_URL}/segments` },
	openGraph: {
		title: "Programa de Fidelidade por Segmento | RecompraCRM",
		description: "Cashback, campanhas no WhatsApp e análise RFM aplicados à realidade de cada tipo de loja. Encontre o seu segmento.",
		url: `${BASE_URL}/segments`,
		type: "website",
	},
};

export default function SegmentsHubPage() {
	const itemListJsonLd = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: "Programa de fidelidade por segmento",
		itemListElement: SEGMENT_PAGES.map((segment, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: segment.title,
			url: `${BASE_URL}/segments/${segment.slug}`,
		})),
	};

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
			<SegmentsHubHero count={SEGMENT_PAGES.length} />
			<SegmentGroups segments={SEGMENT_PAGES} />
			<SegmentsCta
				headline="Pronto para fazer seus clientes voltarem?"
				sub="Agende uma demonstração gratuita e veja cashback, campanhas no WhatsApp, PDI e análise RFM funcionando na sua loja."
				buttonText="Agendar Demo Gratuita"
				whatsappMessage={HUB_WHATSAPP_MESSAGE}
				location="segments_hub_cta"
			/>
		</>
	);
}

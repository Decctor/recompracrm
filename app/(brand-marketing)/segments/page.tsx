import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { SegmentCard } from "@/components/Content/Segment/SegmentCard";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

const BASE_URL = "https://www.recompracrm.com.br";
const WHATSAPP_DEMO_URL = "https://wa.me/553499480791?text=Olá, gostaria de agendar uma demonstração.";

export const metadata: Metadata = {
	title: "Programa de Fidelidade por Segmento",
	description:
		"Cashback, campanhas no WhatsApp e análise RFM aplicados à realidade de cada tipo de loja: restaurantes, pet shops, farmácias, moda e mais. Encontre o seu segmento.",
	alternates: { canonical: `${BASE_URL}/segments` },
	openGraph: {
		title: "Programa de Fidelidade por Segmento | RecompraCRM",
		description:
			"Cashback, campanhas no WhatsApp e análise RFM aplicados à realidade de cada tipo de loja. Encontre o seu segmento.",
		url: `${BASE_URL}/segments`,
		type: "website",
	},
};

export default function SegmentosHubPage() {
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

			<main className="px-6 pb-20 pt-28">
				<div className="container mx-auto max-w-5xl">
					<div className="mb-14 text-center">
						<span className="mb-5 inline-block rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#24549C]">Segmentos</span>
						<h1 className="mb-4 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
							Programa de fidelidade para o <span className="text-[#24549C]">seu segmento</span>
						</h1>
						<p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-500">
							Cashback, campanhas automáticas no WhatsApp e análise RFM aplicados à realidade de cada tipo de loja. Encontre o seu
							segmento e veja como fazer o cliente voltar.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{SEGMENT_PAGES.map((segment) => (
							<SegmentCard key={segment.slug} segment={segment} />
						))}
					</div>

					{/* CTA */}
					<div className="mt-16 rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 to-slate-50 px-6 py-12 text-center">
						<h2 className="mb-3 text-2xl font-black text-slate-900 sm:text-3xl">Não encontrou o seu segmento?</h2>
						<p className="mx-auto mb-6 max-w-xl leading-relaxed text-slate-500">
							O RecompraCRM funciona em qualquer loja física com balcão. Fale com a gente e veja como o programa de fidelidade se
							aplica à sua operação.
						</p>
						<a
							href={WHATSAPP_DEMO_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-2xl bg-[#24549C] px-8 py-4 font-black text-white shadow-lg shadow-[#24549C]/25 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1a3d7a]"
						>
							Agendar Demo Gratuita
							<ArrowRight className="h-5 w-5" />
						</a>
					</div>
				</div>
			</main>
		</>
	);
}

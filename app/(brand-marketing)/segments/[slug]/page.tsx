import { getSegmentPage, SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { ArticleCTA } from "@/components/Content/ArticleCTA";
import { ArticleFAQ, buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { SegmentCard } from "@/components/Content/Segment/SegmentCard";
import { SegmentHero } from "@/components/Content/Segment/SegmentHero";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const BASE_URL = "https://www.recompracrm.com.br";

type Props = {
	params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
	return SEGMENT_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const page = getSegmentPage(slug);
	if (!page) return {};

	const canonicalUrl = `${BASE_URL}/segments/${page.slug}`;

	return {
		title: page.title,
		description: page.metaDescription,
		keywords: page.seo.keywords,
		alternates: { canonical: canonicalUrl },
		openGraph: {
			title: page.title,
			description: page.metaDescription,
			url: canonicalUrl,
			type: "website",
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.metaDescription,
		},
	};
}

function formatUpdatedAt(iso: string) {
	return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

export default async function SegmentDetailPage({ params }: Props) {
	const { slug } = await params;
	const page = getSegmentPage(slug);
	if (!page) notFound();

	const canonicalUrl = `${BASE_URL}/segments/${page.slug}`;
	const relatedSegments = SEGMENT_PAGES.filter((p) => page.relatedSlugs.includes(p.slug));

	const serviceJsonLd = {
		"@context": "https://schema.org",
		"@type": "Service",
		name: page.title,
		serviceType: "Programa de fidelidade e CRM de retenção",
		description: page.metaDescription,
		audience: { "@type": "BusinessAudience", name: page.audience },
		provider: {
			"@type": "Organization",
			name: "RecompraCRM",
			url: BASE_URL,
		},
		areaServed: "BR",
		url: canonicalUrl,
	};

	const breadcrumbJsonLd = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
			{ "@type": "ListItem", position: 2, name: "Segmentos", item: `${BASE_URL}/segments` },
			{ "@type": "ListItem", position: 3, name: page.name, item: canonicalUrl },
		],
	};

	const faqJsonLd = page.faqs.length > 0 ? buildFAQPageJsonLd(page.faqs) : null;

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			<SegmentHero page={page} />

			<div className="px-6 pb-20">
				<div className="container mx-auto max-w-5xl">
					{/* Answer block — extractable definition */}
					<div className="mb-16 rounded-3xl border border-slate-200 bg-slate-50/60 p-8 sm:p-10">
						<div className="flex items-center justify-between gap-4">
							<h2 className="text-lg font-black tracking-tight text-slate-900">Como funciona o programa de fidelidade para {page.audience}?</h2>
							<span className="hidden whitespace-nowrap text-xs font-medium text-slate-400 sm:block">Atualizado em {formatUpdatedAt(page.updatedAt)}</span>
						</div>
						<p className="mt-4 text-lg leading-relaxed text-slate-700">{page.answerBlock}</p>
						<span className="mt-4 block text-xs font-medium text-slate-400 sm:hidden">Atualizado em {formatUpdatedAt(page.updatedAt)}</span>
					</div>

					{/* Challenge */}
					<section className="mb-16">
						<span className="text-xs font-black uppercase tracking-[0.2em] text-[#24549C]">O desafio</span>
						<h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Por que {page.audience} perdem clientes</h2>
						{page.challenge.split("\n\n").map((paragraph) => (
							<p key={paragraph.slice(0, 40)} className="mt-4 max-w-3xl leading-relaxed text-slate-600">
								{paragraph}
							</p>
						))}
					</section>

					{/* Playbook — retention engines applied to the segment */}
					<section id="como-funciona" className="mb-16 scroll-mt-24">
						<div className="mb-8">
							<span className="text-xs font-black uppercase tracking-[0.2em] text-[#24549C]">Como funciona</span>
							<h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">O motor de recompra aplicado a {page.audience}</h2>
							<p className="mt-3 max-w-2xl leading-relaxed text-slate-600">
								Quatro frentes integradas trabalham juntas para transformar cada venda em uma próxima visita — configuradas para a
								realidade do seu segmento.
							</p>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							{page.playbook.map((item) => (
								<Link
									key={item.featureSlug}
									href={`/features/${item.featureSlug}`}
									className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-slate-900/5"
								>
									<span className="text-3xl">{item.emoji}</span>
									<h3 className="mt-4 text-base font-black tracking-tight text-slate-900">{item.title}</h3>
									<p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
									<span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#24549C]">
										Saiba mais
										<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
									</span>
								</Link>
							))}
						</div>
					</section>

					{/* Result band */}
					<section className="mb-16 rounded-3xl bg-slate-900 p-8 sm:p-10">
						<span className="text-xs font-black uppercase tracking-[0.2em] text-[#FFB900]">O resultado</span>
						<p className="mt-4 max-w-3xl text-xl font-bold leading-relaxed text-white sm:text-2xl">{page.result}</p>
					</section>

					<ArticleCTA headline={page.cta.headline} sub={page.cta.sub} buttonText={page.cta.buttonText} whatsappMessage={page.cta.whatsappMessage} />

					<ArticleFAQ faqs={page.faqs} />

					{relatedSegments.length > 0 && (
						<section className="mt-16 border-t border-slate-100 pt-12">
							<h2 className="mb-8 text-xl font-black text-slate-900">Outros segmentos</h2>
							<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
								{relatedSegments.map((segment) => (
									<SegmentCard key={segment.slug} segment={segment} />
								))}
							</div>
						</section>
					)}
				</div>
			</div>
		</>
	);
}

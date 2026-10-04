import { FEATURE_PAGES, getFeaturePage } from "@/app/_content/feature-pages";
import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { ArticleCTA } from "@/components/Content/ArticleCTA";
import { IsoCover } from "@/components/Illustrations/Isometric/IsoCover";
import { ArticleFAQ, buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { ArticleSection } from "@/components/Content/ArticleSection";
import { SegmentCard } from "@/components/Content/Segment/SegmentCard";
import { Calendar } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
	params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
	return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const page = getFeaturePage(slug);
	if (!page) return {};

	const canonicalUrl = `https://www.recompracrm.com.br/features/${page.slug}`;

	return {
		title: page.title,
		description: page.description,
		keywords: page.seo.keywords,
		alternates: { canonical: canonicalUrl },
		openGraph: {
			title: page.title,
			description: page.description,
			url: canonicalUrl,
			type: "website",
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.description,
		},
	};
}

export default async function FuncionalidadePage({ params }: Props) {
	const { slug } = await params;
	const page = getFeaturePage(slug);
	if (!page) notFound();

	const relatedSegments = SEGMENT_PAGES.filter((p) => page.relatedSegmentSlugs.includes(p.slug));

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: `RecompraCRM — ${page.headline}`,
		description: page.description,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "BRL",
			description: "15 dias grátis, sem cartão de crédito",
		},
		publisher: {
			"@type": "Organization",
			name: "RecompraCRM",
			url: "https://www.recompracrm.com.br",
		},
		keywords: page.seo.keywords.join(", "),
	};

	const faqJsonLd = page.faqs && page.faqs.length > 0 ? buildFAQPageJsonLd(page.faqs) : null;

	return (
		<>
			{/* JSON-LD */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			{/* Hero */}
			<section className="bg-gradient-to-b from-slate-50 to-white pt-28 pb-12 px-6">
				<div className="container mx-auto max-w-3xl">
					{/* Breadcrumb */}
					<div className="flex items-center gap-2 mb-6">
						<Link href="/" className="text-sm text-[#24549C] font-semibold hover:underline">
							Home
						</Link>
						<span className="text-slate-300">/</span>
						<Link href="/blog" className="text-sm text-slate-500 hover:text-[#24549C] transition-colors">
							Blog
						</Link>
						<span className="text-slate-300">/</span>
						<span className="text-sm text-slate-400">Funcionalidades</span>
					</div>

					<div className="mb-8 overflow-hidden rounded-[26px] border border-slate-200">
						<IsoCover scene={page.cover} label={page.headline} className="block aspect-[16/8] w-full" />
					</div>

					<span className="inline-block text-xs font-bold text-[#24549C] bg-blue-50 px-3 py-1.5 rounded-full mb-4">Funcionalidade</span>

					<h1 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight mb-4">{page.headline}</h1>
					<p className="text-lg text-slate-600 leading-relaxed mb-6">{page.description}</p>

					{/* Quick trust row */}
					<div className="flex flex-wrap gap-4 text-sm text-slate-500 font-medium">
						<span className="flex items-center gap-1.5">
							<Calendar className="w-4 h-4 text-[#24549C]" />
							15 dias grátis para testar
						</span>
						<span>✓ Sem cartão de crédito</span>
						<span>✓ Suporte incluso</span>
					</div>
				</div>
			</section>

			<div className="px-6 pb-20">
				<div className="container mx-auto max-w-3xl">
					<div className="h-px bg-slate-100 mb-10" />

					{/* Feature body */}
					{page.sections.map((section, i) => (
						<ArticleSection key={i} section={section} />
					))}

					{/* CTA */}
					<ArticleCTA headline={page.cta.headline} sub={page.cta.sub} buttonText={page.cta.buttonText} whatsappMessage={page.cta.whatsappMessage} />

					{/* FAQ */}
					{page.faqs && page.faqs.length > 0 && <ArticleFAQ faqs={page.faqs} />}

					{/* Related segment landings */}
					{relatedSegments.length > 0 && (
						<section className="mt-16 pt-12 border-t border-slate-100">
							<h2 className="text-xl font-black text-slate-900 mb-8">Veja como funciona por segmento</h2>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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

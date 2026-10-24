import { Dock } from "@/app/_components/Dock";
import { FEATURE_PAGES, getFeaturePage } from "@/app/_content/feature-pages";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeatureChapters } from "../_components/FeatureChapters";
import { FeatureCta } from "../_components/FeatureCta";
import { FeatureFaq } from "../_components/FeatureFaq";
import { FeatureHero } from "../_components/FeatureHero";
import { FeatureOthers } from "../_components/FeatureOthers";
import { FeatureTextBlock } from "../_components/FeatureTextBlock";

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

export default async function FeaturePageRoute({ params }: Props) {
	const { slug } = await params;
	const page = getFeaturePage(slug);
	if (!page) notFound();

	// O conteúdo vem em seções do formato do blog; o desenho da página as distribui: o primeiro texto
	// abre, o último fecha, os números vão para a faixa escura do herói e cada destaque vira um capítulo.
	const texts = page.sections.filter((section) => section.type === "text");
	const stats = page.sections.find((section) => section.type === "stats")?.items ?? [];
	const chapters = page.sections.filter((section) => section.type === "feature-highlight");
	const intro = texts[0];
	const closing = texts.length > 1 ? texts[texts.length - 1] : undefined;
	const relatedFeatures = page.relatedFeatureSlugs.map(getFeaturePage).filter((feature) => feature !== undefined);

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
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			<Dock variant="product" />
			<main>
				<FeatureHero page={page} stats={stats} />
				{intro?.heading ? <FeatureTextBlock variant="intro" heading={intro.heading} body={intro.body} /> : null}
				<FeatureChapters slug={page.slug} chapters={chapters} />
				{closing?.heading ? <FeatureTextBlock variant="closing" heading={closing.heading} body={closing.body} /> : null}
				<FeatureCta page={page} />
				<FeatureFaq faqs={page.faqs ?? []} sources={page.sources} />
				<FeatureOthers features={relatedFeatures} />
			</main>
		</>
	);
}

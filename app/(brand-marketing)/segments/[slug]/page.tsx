import { getSegmentPage, SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SegmentFaq } from "../_components/SegmentFaq";
import { SegmentHero } from "../_components/SegmentHero";
import { SegmentChallenge, SegmentConfig, SegmentOutcome, SegmentPlaybook, SegmentRelated } from "../_components/SegmentSections";
import { SegmentsCta } from "../_components/SegmentsCta";

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

export default async function SegmentDetailPage({ params }: Props) {
	const { slug } = await params;
	const page = getSegmentPage(slug);
	if (!page) notFound();

	const canonicalUrl = `${BASE_URL}/segments/${page.slug}`;
	const relatedSegments = page.relatedSlugs.map(getSegmentPage).filter((segment) => segment !== undefined);

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
			<SegmentConfig page={page} />
			<SegmentChallenge page={page} />
			<SegmentPlaybook page={page} />
			<SegmentOutcome page={page} />
			<SegmentFaq faqs={page.faqs} />
			<SegmentRelated segments={relatedSegments} />
			<SegmentsCta
				headline={page.cta.headline}
				sub={page.cta.sub}
				buttonText={page.cta.buttonText}
				whatsappMessage={page.cta.whatsappMessage}
				location="segment_cta"
				segment={page.slug}
			/>
		</>
	);
}

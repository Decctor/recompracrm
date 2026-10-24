import { getIntegrationPage, INTEGRATION_PAGES } from "@/app/_content/integration-pages";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { IntegrationCard } from "@/components/Content/Integration/IntegrationCard";
import { IntegrationCTA } from "@/components/Content/Integration/IntegrationCTA";
import { IntegrationFAQ } from "@/components/Content/Integration/IntegrationFAQ";
import { IntegrationHero } from "@/components/Content/Integration/IntegrationHero";
import { IntegrationHowItWorks } from "@/components/Content/Integration/IntegrationHowItWorks";
import { IntegrationUnlocks } from "@/components/Content/Integration/IntegrationUnlocks";
import { WhatWeImportTable } from "@/components/Content/Integration/WhatWeImportTable";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const BASE_URL = "https://www.recompracrm.com.br";

type Props = {
	params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
	return INTEGRATION_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const page = getIntegrationPage(slug);
	if (!page) return {};

	const canonicalUrl = `${BASE_URL}/integrations/${page.slug}`;

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

function formatUpdatedAt(iso: string) {
	return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export default async function IntegrationDetailPage({ params }: Props) {
	const { slug } = await params;
	const page = getIntegrationPage(slug);
	if (!page) notFound();

	const canonicalUrl = `${BASE_URL}/integrations/${page.slug}`;
	// Na ordem em que a integração lista as relacionadas.
	const relatedIntegrations = page.relatedIntegrationSlugs.flatMap((s) => INTEGRATION_PAGES.filter((p) => p.slug === s));

	const softwareJsonLd = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: `RecompraCRM — Integração ${page.name}`,
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
			url: BASE_URL,
		},
		keywords: page.seo.keywords.join(", "),
	};

	const faqJsonLd = page.faqs.length > 0 ? buildFAQPageJsonLd(page.faqs) : null;

	const breadcrumbJsonLd = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
			{ "@type": "ListItem", position: 2, name: "Integrações", item: `${BASE_URL}/integrations` },
			{ "@type": "ListItem", position: 3, name: page.name, item: canonicalUrl },
		],
	};

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			<IntegrationHero page={page} />

			<main className="mx-auto flex max-w-[1240px] flex-col gap-20 px-6 pt-16 sm:gap-[120px] sm:pt-24">
				{/* Bloco de resposta — definição extraível por buscadores e agentes. */}
				<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-x-[72px] gap-y-5 border-t border-[#0e1214] pt-10">
					<div>
						<h2 className="m-0 text-2xl font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[28px]">O que é a integração {page.name}?</h2>
						<p className="m-0 mt-3 text-[13px] leading-[normal] text-[#8a979c]">
							Atualizado em <time dateTime={page.updatedAt}>{formatUpdatedAt(page.updatedAt)}</time>
						</p>
					</div>
					<p className="m-0 text-lg leading-[1.6] text-[#2b3538] text-pretty sm:text-xl">{page.answerBlock}</p>
				</section>

				<WhatWeImportTable name={page.name} groups={page.whatWeImport} />

				<IntegrationHowItWorks steps={page.howItWorks} />

				<IntegrationUnlocks unlocks={page.unlocks} />

				<IntegrationCTA page={page} />

				<IntegrationFAQ faqs={page.faqs} />

				{relatedIntegrations.length > 0 && (
					<section id="conectores" className="scroll-mt-[110px] border-t border-[#e3e8ea] pt-14 pb-24 sm:pb-[120px]">
						<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
							<h2 className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">Outras integrações</h2>
							<Link
								href="/integrations"
								className="inline-flex items-center gap-1.5 text-[15px] font-medium leading-[normal] text-[#0e1214] hover:text-[#24549c]"
							>
								Ver todas
								<ArrowRight className="size-4" aria-hidden />
							</Link>
						</div>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6">
							{relatedIntegrations.map((integration) => (
								<IntegrationCard key={integration.slug} integration={integration} variant="compact" />
							))}
						</div>
					</section>
				)}
			</main>
		</>
	);
}

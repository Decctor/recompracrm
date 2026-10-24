import { HELP_ARTICLES, getHelpArticle } from "@/app/_content/help-articles";
import { HelpFAQ } from "@/components/Help/HelpFAQ";
import { SupportLink } from "@/components/Help/SupportLink";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TutorialConclusion } from "../_components/TutorialConclusion";
import { TutorialHeader } from "../_components/TutorialHeader";
import { TutorialStep } from "../_components/TutorialStep";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
	return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const article = getHelpArticle((await params).slug);
	if (!article) return {};
	const url = `https://www.recompracrm.com.br/help/${article.slug}`;
	return {
		title: article.title,
		description: article.description,
		alternates: { canonical: url },
		openGraph: { title: article.title, description: article.description, url, type: "article", modifiedTime: article.updatedAt },
		twitter: { card: "summary", title: article.title, description: article.description },
	};
}

export default async function HelpArticlePage({ params }: Props) {
	const article = getHelpArticle((await params).slug);
	if (!article) notFound();

	const url = `https://www.recompracrm.com.br/help/${article.slug}`;
	const howToJsonLd = {
		"@context": "https://schema.org",
		"@type": "HowTo",
		name: article.title,
		description: article.description,
		totalTime: "PT2M",
		step: article.steps.map((step) => ({
			"@type": "HowToStep",
			position: step.number,
			name: step.title,
			text: step.description,
			image: `https://www.recompracrm.com.br${step.image.src}`,
			url: `${url}#passo-${step.number}`,
		})),
	};
	const faqJsonLd = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: article.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
	};

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }} />
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

			<TutorialHeader article={article} />

			<main className="mx-auto flex max-w-[960px] flex-col gap-20 px-6 pt-20 pb-24 sm:gap-24 sm:pt-24 sm:pb-[120px]">
				{article.steps.map((step, i) => (
					<TutorialStep key={step.number} step={step} priority={i === 0} />
				))}

				{article.conclusion ? <TutorialConclusion conclusion={article.conclusion} /> : null}

				<div>
					<HelpFAQ faqs={article.faqs} />
					<p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#e3e8ea] pt-6 text-[15px] leading-[1.5] text-[#5b6a70]">
						Ainda com dúvida?
						<SupportLink location="help_article_faq" className="inline-flex items-center gap-1.5 font-medium text-[#0e1214] hover:text-[#24549c]">
							Fale com o suporte
							<ArrowRight className="size-4" aria-hidden />
						</SupportLink>
					</p>
				</div>
			</main>
		</>
	);
}

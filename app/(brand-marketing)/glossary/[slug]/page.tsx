import { GLOSSARY_CATEGORY_LABELS, GLOSSARY_TERMS, getGlossaryTerm } from "@/app/_content/glossary";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GlossaryCta } from "../_components/GlossaryCta";
import { BASE_URL, GLOSSARY_PATH, glossaryHref, shortDefinition } from "../_components/glossary-format";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
	return GLOSSARY_TERMS.map((term) => ({ slug: term.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const term = getGlossaryTerm((await params).slug);
	if (!term) return {};
	const path = glossaryHref(term.slug);
	return {
		title: term.seoTitle,
		description: term.metaDescription,
		keywords: term.keywords,
		alternates: { canonical: path },
		openGraph: { title: `${term.seoTitle} | RecompraCRM`, description: term.metaDescription, url: `${BASE_URL}${path}`, type: "article" },
		twitter: { card: "summary_large_image", title: `${term.seoTitle} | RecompraCRM`, description: term.metaDescription },
	};
}

const H2 = "text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] max-md:text-[25px]";
const BODY = "text-pretty text-[17px] leading-[1.7] text-[#2b3538]";

export default async function GlossaryTermPage({ params }: Props) {
	const term = getGlossaryTerm((await params).slug);
	if (!term) notFound();

	const url = `${BASE_URL}${glossaryHref(term.slug)}`;
	const related = term.related.map(getGlossaryTerm).filter((item) => item !== undefined);
	const jsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "RecompraCRM", item: BASE_URL },
				{ "@type": "ListItem", position: 2, name: "Glossário", item: `${BASE_URL}${GLOSSARY_PATH}` },
				{ "@type": "ListItem", position: 3, name: term.term, item: url },
			],
		},
		{
			"@context": "https://schema.org",
			"@type": "DefinedTerm",
			name: term.term,
			...(term.fullName ? { alternateName: term.fullName } : {}),
			description: term.definition,
			url,
			inDefinedTermSet: `${BASE_URL}${GLOSSARY_PATH}`,
		},
		buildFAQPageJsonLd(term.faqs),
	];

	return (
		<main>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

			<header id="top" className="bg-white pt-[152px] max-md:pt-28">
				<div className="mx-auto max-w-[880px] px-6 max-md:px-4">
					<nav aria-label="Trilha" className="flex flex-wrap items-center gap-2 text-[14px] text-[#687a80]">
						<Link href={GLOSSARY_PATH} className="font-medium text-[#24549c] hover:text-[#1f4886]">
							Glossário
						</Link>
						<span aria-hidden>/</span>
						<span>{GLOSSARY_CATEGORY_LABELS[term.category]}</span>
					</nav>
					<h1 className="mt-6 text-balance text-[60px] font-semibold leading-[1.03] tracking-[-0.045em] max-md:text-[40px]">{term.question}</h1>
					{term.fullName ? <p className="mt-4 text-[17px] font-medium text-[#687a80]">{term.fullName}</p> : null}

					<div className="mt-10 rounded-[24px] bg-[#eef2f6] p-8 max-md:rounded-[20px] max-md:p-6">
						<p className="mb-3 text-[13px] font-semibold text-[#24549c]">Definição</p>
						<p className="text-pretty text-[21px] leading-[1.6] text-[#0e1214] max-md:text-[18px]">{term.definition}</p>
					</div>
				</div>
			</header>

			<article className="bg-white pt-16 pb-28 max-md:pt-12 max-md:pb-20">
				<div className="mx-auto flex max-w-[880px] flex-col gap-14 px-6 max-md:gap-12 max-md:px-4">
					{term.formula ? (
						<section aria-labelledby="formula">
							<h2 id="formula" className={H2}>
								Como calcular
							</h2>
							<div data-dock="dark" className="mt-6 rounded-[24px] bg-[#0b1628] p-8 text-white max-md:rounded-[20px] max-md:p-6">
								<p className="text-[21px] font-medium leading-[1.5] tracking-[-0.01em] text-pretty max-md:text-[17px]">{term.formula.expression}</p>
								<dl className="mt-6 grid gap-4 border-t border-white/12 pt-6 sm:grid-cols-2">
									{term.formula.parts.map((part) => (
										<div key={part.name}>
											<dt className="text-[14px] font-semibold text-[#ffb900]">{part.name}</dt>
											<dd className="mt-1 text-[15px] leading-[1.55] text-white/72">{part.meaning}</dd>
										</div>
									))}
								</dl>
							</div>
						</section>
					) : null}

					{term.example ? (
						<section aria-labelledby="exemplo">
							<h2 id="exemplo" className={H2}>
								Exemplo
							</h2>
							<div className="mt-6 rounded-[24px] border border-[#e3e8ea] p-8 max-md:rounded-[20px] max-md:p-6">
								<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
									{term.example.lines.map((line) => (
										<li key={line} className="flex gap-3 text-[16px] leading-[1.55] text-[#2b3538]">
											<span className="mt-[9px] size-1.5 flex-none rounded-full bg-[#8a979c]" aria-hidden />
											{line}
										</li>
									))}
								</ul>
								<p className="mt-6 border-t border-[#e3e8ea] pt-5 text-[18px] font-semibold leading-[1.45] tracking-[-0.01em]">{term.example.result}</p>
							</div>
						</section>
					) : null}

					{term.sections.map((section) => (
						<section key={section.heading}>
							<h2 className={H2}>{section.heading}</h2>
							<p className={`mt-4 ${BODY}`}>{section.body}</p>
						</section>
					))}

					{term.inRecompra ? (
						<aside className="rounded-[24px] border border-[#cfdcef] bg-[#f4f7fc] p-8 max-md:rounded-[20px] max-md:p-6">
							<p className="mb-3 text-[13px] font-semibold text-[#24549c]">No RecompraCRM</p>
							<p className={BODY}>{term.inRecompra.text}</p>
							<Link
								href={term.inRecompra.href}
								className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c] hover:text-[#1f4886]"
							>
								{term.inRecompra.label}
								<ArrowRight className="size-4" aria-hidden />
							</Link>
						</aside>
					) : null}

					<section id="perguntas-frequentes" aria-labelledby="duvidas" className="scroll-mt-[96px]">
						<h2 id="duvidas" className={H2}>
							Perguntas frequentes
						</h2>
						<div className="mt-4 flex flex-col border-t border-[#e3e8ea]">
							{term.faqs.map((faq, index) => (
								<details key={faq.question} open={index === 0} className="group border-b border-[#e3e8ea]">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-semibold leading-[1.4] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
										{faq.question}
										<Plus className="size-5 flex-none text-[#687a80] transition-transform group-open:rotate-45" aria-hidden />
									</summary>
									<p className="max-w-[720px] pb-5 text-[16px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
								</details>
							))}
						</div>
					</section>

					{related.length > 0 ? (
						<section aria-labelledby="relacionados">
							<h2 id="relacionados" className={H2}>
								Termos relacionados
							</h2>
							<ul className="m-0 mt-6 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 p-0">
								{related.map((item) => (
									<li key={item.slug}>
										<Link
											href={glossaryHref(item.slug)}
											className="group flex h-full flex-col rounded-[20px] border border-[#e3e8ea] p-5 transition-colors hover:border-[#c9d3d7] hover:bg-[#f7f9f9]"
										>
											<span className="flex items-start justify-between gap-4">
												<span className="text-[18px] font-semibold tracking-[-0.02em]">{item.term}</span>
												<ArrowUpRight className="mt-1 size-4 flex-none text-[#8a979c] transition-colors group-hover:text-[#24549c]" aria-hidden />
											</span>
											<span className="mt-2 line-clamp-2 text-[14px] leading-[1.5] text-[#5b6a70]">{shortDefinition(item)}</span>
										</Link>
									</li>
								))}
							</ul>
							<Link href={GLOSSARY_PATH} className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0e1214] hover:text-[#24549c]">
								Ver todos os termos
								<ArrowRight className="size-4" aria-hidden />
							</Link>
						</section>
					) : null}
				</div>
			</article>

			<GlossaryCta slug={term.slug} />
		</main>
	);
}

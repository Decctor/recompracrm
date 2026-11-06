import { GLOSSARY_TERMS } from "@/app/_content/glossary";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlossaryCta } from "./_components/GlossaryCta";
import { BASE_URL, GLOSSARY_PATH, getGlossaryGroups, glossaryHref, shortDefinition } from "./_components/glossary-format";

const title = "Glossário de varejo: CRM, churn, cashback, LTV e outros termos";
const description =
	"Definições curtas, com fórmula e exemplo quando há conta, dos termos que o lojista encontra todo dia: CRM, churn, cashback, LTV, CAC, ticket médio, markup, margem bruta, curva ABC, giro de estoque, NPS, PDV e NFC-e.";

export const metadata: Metadata = {
	title,
	description,
	alternates: { canonical: GLOSSARY_PATH },
	openGraph: { title: `${title} | RecompraCRM`, description, url: `${BASE_URL}${GLOSSARY_PATH}`, type: "website" },
	twitter: { card: "summary_large_image", title: `${title} | RecompraCRM`, description },
};

const definedTermSetJsonLd = {
	"@context": "https://schema.org",
	"@type": "DefinedTermSet",
	"@id": `${BASE_URL}${GLOSSARY_PATH}`,
	name: "Glossário de varejo RecompraCRM",
	url: `${BASE_URL}${GLOSSARY_PATH}`,
	hasDefinedTerm: GLOSSARY_TERMS.map((term) => ({
		"@type": "DefinedTerm",
		name: term.term,
		description: term.definition,
		url: `${BASE_URL}${glossaryHref(term.slug)}`,
	})),
};

const breadcrumbJsonLd = {
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: [
		{ "@type": "ListItem", position: 1, name: "RecompraCRM", item: BASE_URL },
		{ "@type": "ListItem", position: 2, name: "Glossário", item: `${BASE_URL}${GLOSSARY_PATH}` },
	],
};

export default function GlossaryIndexPage() {
	const groups = getGlossaryGroups();
	return (
		<main>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, definedTermSetJsonLd]) }} />

			<section id="top" className="bg-white pt-[168px] pb-20 max-md:pt-32 max-md:pb-14">
				<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
					<p className="mb-4 text-[13px] font-semibold text-[#24549c]">Glossário de varejo</p>
					<h1 className="max-w-[880px] text-balance text-[64px] font-semibold leading-[1.02] tracking-[-0.045em] max-md:text-[42px]">
						Os termos do varejo, explicados com a conta da loja.
					</h1>
					<p className="mt-6 max-w-[640px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
						Cada verbete responde em poucas linhas o que o termo significa, traz a fórmula quando há conta e um exemplo com números de uma loja hipotética.
					</p>
					<nav aria-label="Categorias" className="mt-9 flex flex-wrap gap-2">
						{groups.map((group) => (
							<a
								key={group.category}
								href={`#${group.category.toLowerCase()}`}
								className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e3e8ea] px-4 text-[14px] font-medium text-[#2b3538] transition-colors hover:bg-[#f7f9f9]"
							>
								{group.label}
								<span className="text-[#8a979c]">{group.terms.length}</span>
							</a>
						))}
					</nav>
				</div>
			</section>

			<section id="termos" className="scroll-mt-[80px] bg-white pb-36 max-md:pb-24">
				<div className="mx-auto flex max-w-[1240px] flex-col gap-20 px-6 max-md:gap-14 max-md:px-4">
					{groups.map((group) => (
						<div
							key={group.category}
							id={group.category.toLowerCase()}
							className="grid scroll-mt-[96px] gap-x-[72px] gap-y-8 border-t border-[#0e1214] pt-10 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]"
						>
							<h2 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] max-md:text-[26px]">{group.label}</h2>
							<ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3 p-0">
								{group.terms.map((term) => (
									<li key={term.slug}>
										<Link
											href={glossaryHref(term.slug)}
											className="group flex h-full flex-col rounded-[20px] border border-[#e3e8ea] p-6 transition-colors hover:border-[#c9d3d7] hover:bg-[#f7f9f9]"
										>
											<span className="flex items-start justify-between gap-4">
												<span className="text-[21px] font-semibold tracking-[-0.02em]">{term.term}</span>
												<ArrowUpRight className="mt-1 size-4 flex-none text-[#8a979c] transition-colors group-hover:text-[#24549c]" aria-hidden />
											</span>
											{term.fullName ? <span className="mt-1 text-[13px] font-medium text-[#687a80]">{term.fullName}</span> : null}
											<span className="mt-3 line-clamp-3 text-[15px] leading-[1.55] text-[#5b6a70]">{shortDefinition(term)}</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</section>

			<GlossaryCta slug="index" />
		</main>
	);
}

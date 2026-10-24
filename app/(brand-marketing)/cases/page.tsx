import { LANDING_CASES } from "@/app/_content/cases";
import type { Metadata } from "next";
import { CaseCard } from "./_components/CaseCard";
import { CasesCta } from "./_components/CasesCta";
import { CASES_BASE_URL, caseHref, caseTitle } from "./_components/case-format";

const title = "Cases de clientes";
const description =
	"Lojas que usam o RecompraCRM contam, em vídeo, o que mudou nas vendas e no retorno dos clientes: receita extra com campanhas no WhatsApp, cashback e recompra.";

export const metadata: Metadata = {
	title,
	description,
	alternates: { canonical: "/cases" },
	openGraph: { title: `${title} | RecompraCRM`, description, url: `${CASES_BASE_URL}/cases` },
	twitter: { title: `${title} | RecompraCRM`, description },
};

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "CollectionPage",
	name: title,
	description,
	url: `${CASES_BASE_URL}/cases`,
	mainEntity: {
		"@type": "ItemList",
		itemListElement: LANDING_CASES.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			url: `${CASES_BASE_URL}${caseHref(item)}`,
			name: caseTitle(item),
		})),
	},
};

export default function CasesPage() {
	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			<header id="top" className="pt-[168px] max-md:pt-[120px]">
				<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-end gap-x-[72px] gap-y-6 px-6">
					<div>
						<span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-[#e3e8ea] px-3 text-[13px] font-medium whitespace-nowrap text-[#4b585d]">
							<span className="h-1.5 w-1.5 rounded-full bg-[#ffb900]" aria-hidden />
							Resultado comprovado
						</span>
						<h1 className="mt-7 text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance max-md:text-[44px]">Cases de clientes</h1>
					</div>
					<p className="max-w-[520px] text-[19px] leading-[1.6] text-pretty text-[#5b6a70] max-md:text-[17px]">
						Lojas que usam o RecompraCRM contam, em vídeo, o que mudou nas vendas e no retorno dos clientes.
					</p>
				</div>
			</header>

			<section id="cases" aria-label="Cases" className="scroll-mt-[60px] pt-[72px] max-md:pt-12">
				<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] gap-6 px-6">
					{LANDING_CASES.map((item) => (
						<CaseCard key={item.id} item={item} />
					))}
				</div>
			</section>

			<CasesCta location="cases_hub" />
		</>
	);
}

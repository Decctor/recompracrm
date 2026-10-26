import type { FAQItem } from "@/app/_content/blog-posts";
import { Plus } from "lucide-react";
import { headingAnchor } from "./article-text";

type ArticleFAQProps = {
	faqs: FAQItem[];
	title?: string;
};

// Seção de perguntas frequentes. Usa <details>/<summary> nativos para ser semântica, acessível e
// legível por agentes de IA mesmo sem JavaScript. O `name` comum faz o acordeão abrir um item por
// vez (como no design); a primeira pergunta já vem aberta.
export function ArticleFAQ({ faqs, title = "Perguntas frequentes" }: ArticleFAQProps) {
	if (faqs.length === 0) return null;
	const id = headingAnchor(title);

	return (
		<section className="mt-14 flex flex-col">
			<h2
				id={id}
				data-outline={title}
				className="m-0 mb-4 scroll-mt-[110px] text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0e1214] text-balance sm:text-[32px]"
			>
				{title}
			</h2>
			{faqs.map((faq, i) => (
				<details
					key={faq.question}
					name={`faq-${id}`}
					open={i === 0}
					className="group border-t border-[#e3e8ea] [&_summary::-webkit-details-marker]:hidden"
				>
					<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[22px] text-[17px] font-medium text-[#0e1214] sm:text-lg">
						{faq.question}
						<span className="flex size-8 flex-none items-center justify-center rounded-full bg-[#f2f4f4] text-[#0e1214] transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:bg-[#0e1214] group-open:text-white">
							<Plus className="size-4" aria-hidden />
						</span>
					</summary>
					<p className="m-0 pr-0 pb-6 text-base leading-[1.7] text-[#5b6a70] sm:pr-14">{faq.answer}</p>
				</details>
			))}
		</section>
	);
}

// Gera o objeto JSON-LD FAQPage a partir da lista de perguntas.
export function buildFAQPageJsonLd(faqs: FAQItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((faq) => ({
			"@type": "Question",
			name: faq.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: faq.answer,
			},
		})),
	};
}

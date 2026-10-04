import type { FAQItem } from "@/app/_content/blog-posts";
import { Plus } from "lucide-react";

type ArticleFAQProps = {
	faqs: FAQItem[];
	title?: string;
};

// Seção de perguntas frequentes. Usa <details>/<summary> nativos para ser
// semântica, acessível e legível por agentes de IA mesmo sem JavaScript.
export function ArticleFAQ({ faqs, title = "Perguntas frequentes" }: ArticleFAQProps) {
	if (faqs.length === 0) return null;

	return (
		<section className="mt-16">
			<h2 className="mb-6 text-2xl font-extrabold tracking-[-0.015em] text-slate-900 sm:text-[28px]">{title}</h2>
			<div className="divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200 bg-white">
				{faqs.map((faq) => (
					<details key={faq.question} className="group [&_summary::-webkit-details-marker]:hidden">
						<summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-base font-bold text-slate-900 transition-colors hover:bg-slate-50 sm:text-[17px]">
							{faq.question}
							<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#24549C]/10 text-[#24549C] transition-[transform,background-color] duration-300 group-open:rotate-45 group-open:bg-[#24549C] group-open:text-white">
								<Plus className="size-4" aria-hidden />
							</span>
						</summary>
						<p className="px-6 pb-6 leading-relaxed text-slate-600">{faq.answer}</p>
					</details>
				))}
			</div>
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

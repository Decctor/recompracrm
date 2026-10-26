import type { FAQItem } from "@/app/_content/blog-posts";
import { Plus } from "lucide-react";

// Perguntas frequentes em duas colunas (título à esquerda, acordeão à direita). `<details>` nativo
// com `name` comum: semântico, legível sem JavaScript e com um item aberto por vez; o primeiro já
// vem aberto, como no design.
export function IntegrationFAQ({ faqs }: { faqs: FAQItem[] }) {
	if (faqs.length === 0) return null;

	return (
		<section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-[72px] gap-y-6 sm:gap-y-8">
			<h2 className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">Perguntas frequentes</h2>
			<div className="min-w-0">
				{faqs.map((faq, i) => (
					<details
						key={faq.question}
						name="integration-faq"
						open={i === 0}
						className="group border-t border-[#e3e8ea] [&_summary::-webkit-details-marker]:hidden"
					>
						<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[22px] text-[17px] font-medium leading-[1.35] text-[#0e1214] sm:text-lg">
							{faq.question}
							<span className="flex size-8 flex-none items-center justify-center rounded-full bg-[#f2f4f4] text-[#0e1214] transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:bg-[#0e1214] group-open:text-white">
								<Plus className="size-4" aria-hidden />
							</span>
						</summary>
						<p className="m-0 pb-6 text-base leading-[1.7] text-[#5b6a70] sm:pr-14">{faq.answer}</p>
					</details>
				))}
			</div>
		</section>
	);
}

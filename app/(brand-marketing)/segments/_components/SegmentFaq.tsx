"use client";

import type { FAQItem } from "@/app/_content/blog-posts";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useId, useState } from "react";

// Perguntas frequentes do segmento: uma resposta aberta por vez, começando pela primeira. As
// respostas fechadas ficam no HTML (com `hidden`), então continuam indexáveis e batem com o
// JSON-LD de FAQPage.
export function SegmentFaq({ faqs }: { faqs: FAQItem[] }) {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();
	if (faqs.length === 0) return null;

	return (
		<section className="pt-[120px] max-md:pt-20">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-[72px] gap-y-8 px-6">
				<h2 className="text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-md:text-[32px]">Perguntas frequentes</h2>
				<div className="min-w-0">
					{faqs.map((faq, i) => {
						const open = openIndex === i;
						const panelId = `${baseId}-resposta-${i}`;
						return (
							<div key={faq.question} className="border-t border-[#e3e8ea]">
								<button
									type="button"
									aria-expanded={open}
									aria-controls={panelId}
									onClick={() => setOpenIndex(open ? -1 : i)}
									className="flex w-full cursor-pointer items-center justify-between gap-4 py-[22px] text-left text-[18px] font-medium text-[#0e1214] max-md:text-[17px]"
								>
									{faq.question}
									<span
										className={cn(
											"flex size-8 flex-none items-center justify-center rounded-full transition-[transform,background-color,color] duration-300",
											open ? "rotate-45 bg-[#0e1214] text-white" : "bg-[#f2f4f4] text-[#0e1214]",
										)}
									>
										<Plus className="size-4" aria-hidden />
									</span>
								</button>
								<p id={panelId} hidden={!open} className="pr-14 pb-6 text-[16px] leading-[1.7] text-[#5b6a70] max-md:pr-0">
									{faq.answer}
								</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}

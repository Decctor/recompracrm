"use client";

import type { FAQItem } from "@/app/_content/blog-posts";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useId, useState } from "react";

// Acordeão de uma resposta aberta por vez, começando pela primeira. As respostas fechadas ficam no
// HTML (com `hidden`), então continuam indexáveis e batem com o JSON-LD de FAQPage.
export function FeatureFaqList({ faqs }: { faqs: FAQItem[] }) {
	const [openIndex, setOpenIndex] = useState(0);
	const baseId = useId();

	return (
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
							className="flex w-full cursor-pointer items-center justify-between gap-4 border-0 bg-transparent py-[22px] text-left font-[inherit] text-[18px] font-medium text-[#0e1214] max-sm:text-[17px]"
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
						<p id={panelId} hidden={!open} className="m-0 pr-14 pb-6 text-[16px] leading-[1.7] text-[#5b6a70] max-sm:pr-0">
							{faq.answer}
						</p>
					</div>
				);
			})}
		</div>
	);
}

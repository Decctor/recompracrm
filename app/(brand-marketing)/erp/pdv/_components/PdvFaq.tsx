import { Plus } from "lucide-react";
import { PDV_FAQS } from "./pdv-content";

// Perguntas em <details> nativo: as respostas ficam no HTML (lidas por buscadores e IAs) e abrem
// sem JavaScript. O JSON-LD FAQPage da página é montado a partir da mesma lista.
export function PdvFaq() {
	return (
		<section id="faq" className="bg-white py-36 max-md:py-24">
			<div className="mx-auto grid max-w-[1240px] gap-x-[72px] gap-y-10 px-6 max-md:px-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
				<div>
					<p className="mb-4 text-[13px] font-semibold text-[#24549c]">06 · Dúvidas</p>
					<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">Perguntas sobre o PDV.</h2>
				</div>
				<div className="flex flex-col border-t border-[#e3e8ea]">
					{PDV_FAQS.map((faq, index) => (
						<details key={faq.question} open={index === 0} className="group border-b border-[#e3e8ea]">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
								{faq.question}
								<Plus className="size-5 flex-none text-[#687a80] transition-transform group-open:rotate-45" aria-hidden />
							</summary>
							<p className="max-w-[680px] pb-6 text-[16px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

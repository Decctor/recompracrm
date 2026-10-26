import { Plus } from "lucide-react";

type HelpFAQProps = {
	faqs: { question: string; answer: string }[];
};

// "Dúvidas frequentes" do tutorial. `<details>` nativo com `name` comum: um item aberto por vez,
// o primeiro já aberto, e o texto continua legível sem JavaScript.
export function HelpFAQ({ faqs }: HelpFAQProps) {
	if (faqs.length === 0) return null;

	return (
		<section aria-labelledby="duvidas-frequentes">
			<p className="m-0 text-[13px] font-semibold leading-[normal] text-[#24549c]">Solução de problemas</p>
			<h2 id="duvidas-frequentes" className="m-0 mt-2 mb-6 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">
				Dúvidas frequentes
			</h2>
			{faqs.map((faq, i) => (
				<details key={faq.question} name="help-faq" open={i === 0} className="group border-t border-[#e3e8ea] [&_summary::-webkit-details-marker]:hidden">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-[22px] text-[17px] font-medium leading-[1.35] text-[#0e1214] sm:text-lg">
						{faq.question}
						<span className="flex size-8 flex-none items-center justify-center rounded-full bg-[#f2f4f4] text-[#0e1214] transition-[transform,background-color,color] duration-300 group-open:rotate-45 group-open:bg-[#0e1214] group-open:text-white">
							<Plus className="size-4" aria-hidden />
						</span>
					</summary>
					<p className="m-0 pb-6 text-base leading-[1.7] text-[#5b6a70] sm:pr-14">{faq.answer}</p>
				</details>
			))}
		</section>
	);
}

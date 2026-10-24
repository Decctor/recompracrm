import type { THelpArticle } from "@/app/_content/help-articles";
import { ShieldCheck } from "lucide-react";

// Fechamento do tutorial: o que fazer agora e exemplos para experimentar.
export function TutorialConclusion({ conclusion }: { conclusion: NonNullable<THelpArticle["conclusion"]> }) {
	return (
		<section data-dock="dark" aria-labelledby="conclusao" className="rounded-[28px] bg-[#1a3d7a] px-6 py-10 text-white sm:p-12">
			<span className="flex size-12 items-center justify-center rounded-2xl bg-[#ffb900] text-[#1a3d7a]">
				<ShieldCheck className="size-6" aria-hidden />
			</span>
			<h2 id="conclusao" className="m-0 mt-6 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[34px]">
				{conclusion.title}
			</h2>
			<p className="m-0 mt-3 max-w-[600px] text-base leading-[1.6] text-white/75 sm:text-[17px]">{conclusion.description}</p>
			<ul className="m-0 mt-7 flex list-none flex-col gap-2.5 p-0">
				{conclusion.examples.map((example) => (
					<li key={example} className="rounded-[14px] border border-white/10 bg-white/9 px-[18px] py-3.5 text-[15px] font-medium leading-[1.4]">
						“{example}”
					</li>
				))}
			</ul>
		</section>
	);
}

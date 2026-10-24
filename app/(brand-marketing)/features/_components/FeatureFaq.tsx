import type { FAQItem } from "@/app/_content/blog-posts";
import { FeatureFaqList } from "./FeatureFaqList";

type FeatureFaqProps = {
	faqs: FAQItem[];
	sources?: { label: string; url: string }[];
};

// Perguntas frequentes com as fontes dos números de mercado embaixo do título.
export function FeatureFaq({ faqs, sources }: FeatureFaqProps) {
	if (faqs.length === 0) return null;
	return (
		<section className="pt-32 max-sm:pt-24">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-[72px] gap-y-8 px-6">
				<div>
					<h2 id="perguntas-frequentes" className="m-0 scroll-mt-[110px] text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-sm:text-[32px]">
						Perguntas frequentes
					</h2>
					{sources && sources.length > 0 ? (
						<div className="mt-10 border-t border-[#e3e8ea] pt-5 max-sm:mt-8">
							<p className="m-0 mb-3 text-[13px] font-semibold text-[#687a80]">Fontes</p>
							<ol className="m-0 flex list-none flex-col gap-2.5 p-0">
								{sources.map((source, i) => (
									<li key={source.url} className="grid grid-cols-[20px_minmax(0,1fr)] gap-1.5 text-[13px] leading-[1.5]">
										<span className="font-semibold text-[#8a979c]">{i + 1}.</span>
										<a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#2b3538] transition-colors hover:text-[#24549c]">
											{source.label}
										</a>
									</li>
								))}
							</ol>
						</div>
					) : null}
				</div>
				<FeatureFaqList faqs={faqs} />
			</div>
		</section>
	);
}

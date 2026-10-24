import { cn } from "@/lib/utils";
import { FeatureRichText } from "./FeatureRichText";
import { FeatureStage } from "./FeatureStage";
import { getChapterScreen, getFeatureShowcase } from "./feature-showcase";

type FeatureChaptersProps = {
	slug: string;
	chapters: { title: string; body: string }[];
};

// Capítulos numerados: um `feature-highlight` do conteúdo por capítulo, cada um ao lado da tela do
// app que ele descreve. Com duas colunas, o texto alterna de lado a cada capítulo.
export function FeatureChapters({ slug, chapters }: FeatureChaptersProps) {
	const showcase = getFeatureShowcase(slug);
	if (chapters.length === 0) return null;

	return (
		<section id="conteudo" className="scroll-mt-10 pt-32 max-sm:pt-24">
			<div className="mx-auto flex max-w-[1240px] flex-col gap-32 px-6 max-sm:gap-24">
				{chapters.map((chapter, i) => (
					<div
						key={chapter.title}
						className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-12 max-sm:gap-y-10"
					>
						<div className={cn("max-w-[520px] min-w-0", i % 2 === 1 && "min-[1040px]:order-2")}>
							<p className="m-0 text-[13px] font-semibold text-[#24549c]">{String(i + 1).padStart(2, "0")}</p>
							<h2 className="m-0 mt-3.5 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance max-sm:text-[28px]">{chapter.title}</h2>
							<div className="mt-5 flex flex-col gap-4 text-[16px] leading-[1.65] text-[#5b6a70]">
								<FeatureRichText body={chapter.body} />
							</div>
						</div>
						{showcase ? <FeatureStage screen={getChapterScreen(showcase, i)} /> : null}
					</div>
				))}
			</div>
		</section>
	);
}

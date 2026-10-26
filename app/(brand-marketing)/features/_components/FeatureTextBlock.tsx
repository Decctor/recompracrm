import { cn } from "@/lib/utils";
import { FeatureRichText } from "./FeatureRichText";

type FeatureTextBlockProps = {
	heading: string;
	body: string;
	/** `intro` abre a página logo após o herói; `closing` fecha os capítulos, com fio escuro em cima e texto mais discreto. */
	variant: "intro" | "closing";
};

// Bloco de texto em duas colunas (título à esquerda, corpo à direita) que abre e fecha os capítulos.
export function FeatureTextBlock({ heading, body, variant }: FeatureTextBlockProps) {
	const closing = variant === "closing";
	return (
		<section className="pt-32 max-sm:pt-24">
			<div className="mx-auto max-w-[1240px] px-6">
				<div
					className={cn(
						"grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-x-20 gap-y-6",
						closing && "border-t border-[#0e1214] pt-14",
					)}
				>
					<h2 className="m-0 text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance max-sm:text-[32px]">{heading}</h2>
					<div
						// A entrelinha vem depois do tamanho: o `cn` (tailwind-merge) descarta um `leading-*` seguido de `text-[..]`.
						className={cn(
							"flex flex-col gap-[18px]",
							closing ? "text-[17px] text-[#5b6a70]" : "text-[18px] text-[#2b3538] max-sm:text-[17px]",
							"leading-[1.7]",
						)}
					>
						<FeatureRichText body={body} />
					</div>
				</div>
			</div>
		</section>
	);
}

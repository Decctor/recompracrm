import type { SegmentPage } from "@/app/_content/segment-pages";
import { SegmentCard } from "./SegmentCard";
import { SEGMENT_FAMILY_ORDER, SEGMENT_FAMILY_THEMES } from "./segment-families";

export function SegmentsHubHero({ count }: { count: number }) {
	return (
		<header id="top" className="pt-[168px] max-md:pt-28">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-end gap-x-[72px] gap-y-6 px-6">
				<div>
					<span className="inline-flex h-[30px] items-center rounded-full border border-[#e3e8ea] px-3 text-[13px] font-medium whitespace-nowrap text-[#4b585d]">
						{count} segmentos
					</span>
					<h1 className="mt-7 text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance max-md:text-[44px] max-md:leading-[1.04]">
						Fidelização por segmento
					</h1>
				</div>
				<p className="max-w-[520px] text-[19px] leading-[1.6] text-pretty text-[#5b6a70] max-md:text-[17px]">
					Cada segmento começa com cashback, validade e limite de resgate alinhados à margem e ao ciclo de recompra do seu tipo de loja.
				</p>
			</div>
		</header>
	);
}

// Um grupo por família visual, na ordem do protótipo; dentro do grupo, a ordem do conteúdo.
export function SegmentGroups({ segments }: { segments: SegmentPage[] }) {
	return (
		<section id="segmentos" className="scroll-mt-[60px] pt-[88px] max-md:pt-16">
			<div className="mx-auto flex max-w-[1240px] flex-col gap-[72px] px-6 max-md:gap-14">
				{SEGMENT_FAMILY_ORDER.map((family) => {
					const theme = SEGMENT_FAMILY_THEMES[family];
					const items = segments.filter((segment) => segment.family === family);
					if (items.length === 0) return null;
					const Icon = theme.icon;
					return (
						<div key={family} className="flex flex-col gap-6 border-t border-[#0e1214] pt-6">
							<div className="flex items-center gap-3.5">
								<span
									className="flex size-11 flex-none items-center justify-center rounded-full"
									style={{ background: theme.dark ? "#0e1214" : theme.bg, color: theme.accent }}
								>
									<Icon className="size-5" aria-hidden />
								</span>
								<h2 className="text-[24px] font-semibold tracking-[-0.025em] max-md:text-[21px]">{theme.label}</h2>
								<p className="ml-auto text-[14px] whitespace-nowrap text-[#687a80]">
									{items.length} {items.length === 1 ? "segmento" : "segmentos"}
								</p>
							</div>
							<div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">
								{items.map((segment) => (
									<SegmentCard key={segment.slug} segment={segment} />
								))}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

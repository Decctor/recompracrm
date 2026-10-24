import type { SegmentPage } from "@/app/_content/segment-pages";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SEGMENT_FAMILY_THEMES, segmentIllustration } from "./segment-families";
import { SegmentHeroVisual } from "./SegmentHeroVisual";
import { TrackedCta } from "./TrackedCta";

// Herói do segmento: painel arredondado na cor da família (escuro em Reposição e Casa/obra, que
// marcam `data-dock="dark"`), com a ilustração isométrica do segmento e a cena da família ao lado.
export function SegmentHero({ page }: { page: SegmentPage }) {
	const theme = SEGMENT_FAMILY_THEMES[page.family];
	const FamilyIcon = theme.icon;
	const dark = theme.dark;

	return (
		<header id="top" className="px-3 pt-24">
			<div
				data-dock={dark ? "dark" : undefined}
				className={cn(
					"mx-auto max-w-[1416px] rounded-[32px] px-8 py-[72px] max-md:rounded-[24px] max-md:px-5 max-md:pt-16 max-md:pb-8",
					dark ? "text-white" : "text-[#0e1214]",
				)}
				style={{ background: theme.bg }}
			>
				<div className="mx-auto grid max-w-[1216px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-center gap-x-[72px] gap-y-12 max-md:gap-y-10">
					<div className="min-w-0">
						<nav aria-label="Trilha" className="mb-10 flex items-center gap-2 text-[14px] max-md:mb-6">
							<Link href="/segments" className={cn("font-medium transition-opacity hover:opacity-70", dark ? "text-white" : "text-[#0e1214]")}>
								Segmentos
							</Link>
							<ChevronRight className={cn("size-3.5 flex-none", dark ? "text-white/35" : "text-[#c9d1d4]")} aria-hidden />
							<span className={cn("truncate", dark ? "text-white/65" : "text-[#5b6a70]")}>{page.name}</span>
						</nav>
						<div className="flex items-end justify-between gap-4">
							<span
								className={cn(
									"inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap",
									dark ? "bg-white/8" : "bg-white",
								)}
								style={{ color: theme.accent }}
							>
								<FamilyIcon className="size-3.5 flex-none" aria-hidden />
								{theme.label}
							</span>
							<span className="relative -mb-3 block h-[110px] w-[150px] flex-none max-md:-mb-2 max-md:h-[88px] max-md:w-[120px]">
								<Image src={segmentIllustration(page.slug)} alt="" fill unoptimized priority className="object-contain" />
							</span>
						</div>
						<h1 className="mt-6 text-[56px] leading-[1.03] font-semibold tracking-[-0.04em] text-balance max-md:text-[38px] max-md:leading-[1.06]">
							{page.tagline}
						</h1>
						<p className={cn("mt-5 max-w-[560px] text-[18px] leading-[1.6] text-pretty max-md:text-[17px]", dark ? "text-white/65" : "text-[#5b6a70]")}>
							{page.heroSubtitle}
						</p>
						<div className="mt-7 flex flex-wrap gap-2.5">
							<TrackedCta
								href="#cta"
								ctaId="segment_hero_demo"
								location="segment_hero"
								segment={page.slug}
								className={cn(
									"inline-flex h-[46px] items-center gap-2 rounded-full px-[22px] text-[15px] font-semibold whitespace-nowrap transition-colors",
									dark ? "bg-[#ffb900] text-[#171717] hover:bg-[#ffc933]" : "bg-[#0e1214] text-white hover:bg-[#24303a]",
								)}
							>
								{page.cta.buttonText}
								<ArrowRight className="size-4 flex-none" aria-hidden />
							</TrackedCta>
							<a
								href="#config"
								className={cn(
									"inline-flex h-[46px] items-center rounded-full border px-[22px] text-[15px] font-medium whitespace-nowrap transition-colors",
									dark ? "border-white/20 text-white hover:bg-white/8" : "border-[rgba(14,18,20,0.12)] text-[#0e1214] hover:bg-white/60",
								)}
							>
								Ver a configuração sugerida
							</a>
						</div>
					</div>
					<div className="min-w-0">
						<SegmentHeroVisual page={page} />
					</div>
				</div>
			</div>
		</header>
	);
}

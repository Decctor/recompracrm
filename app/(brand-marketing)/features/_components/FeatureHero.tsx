import { FEATURE_PAGES, type FeaturePage } from "@/app/_content/feature-pages";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { FeatureStage } from "./FeatureStage";
import { TrackedCta } from "./TrackedCta";
import { featureHref } from "./feature-links";
import { getFeatureShowcase } from "./feature-showcase";

const TRUST_ITEMS = ["15 dias grátis para testar", "Sem cartão de crédito", "Suporte incluso"];

type FeatureHeroProps = {
	page: FeaturePage;
	stats: { value: string; label: string; source?: string }[];
};

export function FeatureHero({ page, stats }: FeatureHeroProps) {
	const showcase = getFeatureShowcase(page.slug);
	const Icon = showcase?.icon;

	return (
		<header id="top" className="pt-[152px] max-md:pt-28">
			<div className="mx-auto max-w-[1240px] px-6">
				<div className="mb-14 flex flex-wrap items-center justify-between gap-4 max-md:mb-10">
					<nav aria-label="Trilha" className="flex items-center gap-2 text-[14px]">
						<Link href="/" className="font-medium text-[#0e1214] transition-colors hover:text-[#24549c]">
							Produto
						</Link>
						<ChevronRight className="size-3.5 text-[#c9d1d4]" aria-hidden />
						<span className="text-[#687a80]">Funcionalidades</span>
					</nav>
					{/* No celular as quatro abas não cabem numa linha: viram uma faixa com rolagem lateral, em vez de quebrar a cápsula em três linhas. */}
					<nav
						aria-label="Funcionalidades"
						className="max-w-full overflow-x-auto rounded-full [scrollbar-width:none] max-sm:-mx-6 max-sm:w-[calc(100%+3rem)] max-sm:max-w-none max-sm:rounded-none max-sm:px-6 [&::-webkit-scrollbar]:hidden"
					>
						<div className="flex w-max gap-1 rounded-full bg-[#f2f4f4] p-1">
							{FEATURE_PAGES.map((feature) => {
								const TabIcon = getFeatureShowcase(feature.slug)?.icon;
								const active = feature.slug === page.slug;
								return (
									<Link
										key={feature.slug}
										href={featureHref(feature.slug)}
										aria-current={active ? "page" : undefined}
										className={cn(
											"inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium whitespace-nowrap transition-colors",
											active
												? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_2px_8px_-2px_rgba(16,24,40,0.1)]"
												: "text-[#5b6a70] hover:text-[#0e1214]",
										)}
									>
										{TabIcon ? <TabIcon className="size-[15px] flex-none" aria-hidden /> : null}
										{feature.shortName}
									</Link>
								);
							})}
						</div>
					</nav>
				</div>

				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-center gap-x-16 gap-y-12">
					<div>
						<p className="m-0 mb-5 flex items-center gap-2.5 text-[14px] font-semibold text-[#24549c]">
							{Icon ? <Icon className="size-[18px] flex-none" aria-hidden /> : null}
							{page.shortName}
						</p>
						<h1 className="m-0 text-[56px] leading-[1.03] font-semibold tracking-[-0.04em] text-balance max-sm:text-[40px] max-sm:leading-[1.05]">
							{page.headline}
						</h1>
						<p className="m-0 mt-6 max-w-[540px] text-[18px] leading-[1.6] text-pretty text-[#5b6a70] max-sm:text-[17px]">{page.description}</p>
						<div className="mt-7 flex flex-wrap gap-2.5">
							<TrackedCta
								href="#cta"
								slug={page.slug}
								ctaId="feature_hero_demo"
								location="feature_hero"
								className="inline-flex h-[46px] items-center gap-2 rounded-full bg-[#0e1214] px-[22px] text-[15px] font-medium whitespace-nowrap text-white transition-colors hover:bg-[#24303a]"
							>
								{page.cta.buttonText}
								<ArrowRight className="size-4 flex-none" aria-hidden />
							</TrackedCta>
							<TrackedCta
								href="#conteudo"
								slug={page.slug}
								ctaId="feature_hero_ver_por_dentro"
								location="feature_hero"
								className="inline-flex h-[46px] items-center rounded-full border border-[#e3e8ea] px-[22px] text-[15px] font-medium whitespace-nowrap text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
							>
								Ver por dentro
							</TrackedCta>
						</div>
						<ul className="m-0 mt-6 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[14px] text-[#5b6a70]">
							{TRUST_ITEMS.map((item) => (
								<li key={item} className="flex items-center gap-1.5">
									<Check className="size-3.5 flex-none text-[#24549c]" aria-hidden />
									{item}
								</li>
							))}
						</ul>
					</div>
					{showcase ? <FeatureStage screen={showcase.hero} /> : null}
				</div>

				{stats.length > 0 ? (
					<div
						data-dock="dark"
						className="mt-[72px] grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-10 rounded-[28px] bg-[#0b1628] p-10 text-white max-sm:mt-14 max-sm:gap-8 max-sm:rounded-[20px] max-sm:p-6"
					>
						{stats.map((stat) => (
							<div key={stat.label} className="flex flex-col gap-3 border-t border-white/18 pt-5">
								<span className="text-[64px] leading-[0.95] font-medium tracking-[-0.05em] max-sm:text-[52px]">{stat.value}</span>
								<span className="max-w-[30ch] text-[16px] leading-[1.45] text-white/75">{stat.label}</span>
								<span className="mt-auto text-[12px] text-white/45">{stat.source ? `Fonte: ${stat.source}` : "Dado do produto"}</span>
							</div>
						))}
					</div>
				) : null}
			</div>
		</header>
	);
}

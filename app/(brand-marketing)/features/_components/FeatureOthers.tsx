import type { FeaturePage } from "@/app/_content/feature-pages";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PLANS_HREF, featureHref } from "./feature-links";
import { getFeatureShowcase } from "./feature-showcase";

// Cartões para as outras funcionalidades (`relatedFeatureSlugs`) e o atalho para os planos.
export function FeatureOthers({ features }: { features: FeaturePage[] }) {
	if (features.length === 0) return null;
	return (
		<section className="pt-32 pb-[120px] max-sm:pt-24 max-sm:pb-20">
			<div className="mx-auto max-w-[1240px] px-6">
				<div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-t border-[#e3e8ea] pt-14">
					<h2 className="m-0 text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-sm:text-[32px]">Outras funcionalidades</h2>
					<Link
						href={PLANS_HREF}
						className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0e1214] transition-colors hover:text-[#24549c]"
					>
						Ver planos
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				</div>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6">
					{features.map((feature) => {
						const Icon = getFeatureShowcase(feature.slug)?.icon;
						return (
							<Link
								key={feature.slug}
								href={featureHref(feature.slug)}
								className="flex min-h-[260px] flex-col gap-4 rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-7 text-[#0e1214] transition-[box-shadow,transform] duration-[350ms] hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] max-sm:min-h-0 max-sm:p-6"
							>
								<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
									{Icon ? <Icon className="size-5" aria-hidden /> : null}
								</span>
								<span className="text-[14px] font-semibold text-[#24549c]">{feature.shortName}</span>
								<span className="text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-balance">{feature.headline}</span>
								<span className="mt-auto flex items-center justify-between border-t border-[#eef1f2] pt-4 text-[14px] font-medium text-[#5b6a70]">
									Conhecer
									<ArrowUpRight className="size-[18px] text-[#8a979c]" aria-hidden />
								</span>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
}

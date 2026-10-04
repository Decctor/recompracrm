import type { FeaturePage } from "@/app/_content/feature-pages";
import { IsoCover } from "@/components/Illustrations/Isometric/IsoCover";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

type FeatureCardProps = {
	feature: FeaturePage;
};

export function FeatureCard({ feature }: FeatureCardProps) {
	return (
		<Link
			href={`/features/${feature.slug}`}
			className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[#24549C]/25 hover:shadow-[0_12px_32px_-12px_rgba(36,84,156,0.18),0_4px_8px_rgba(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#24549C]/30"
		>
			<div className="overflow-hidden">
				<IsoCover scene={feature.cover} className="block aspect-[16/9] w-full transition-transform duration-500 group-hover:scale-[1.03]" />
			</div>
			<div className="flex flex-1 flex-col p-6">
				<p className="mb-3 text-label text-[#24549C]">Funcionalidade</p>
				<h3 className="mb-2 text-lg font-extrabold leading-snug tracking-[-0.01em] text-slate-900 transition-colors group-hover:text-[#24549C]">{feature.headline}</h3>
				<p className="mb-5 flex-1 text-[15px] leading-relaxed text-slate-500">{feature.description}</p>
				<span className="inline-flex items-center gap-1 text-sm font-bold text-[#24549C] transition-[gap] group-hover:gap-2">
					Saiba mais <ArrowRight className="size-4" aria-hidden />
				</span>
			</div>
		</Link>
	);
}

import type { IntegrationUnlock } from "@/app/_content/integration-pages";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getFeatureIcon } from "./integration-icons";

type IntegrationUnlocksProps = {
	unlocks: IntegrationUnlock[];
};

// "O que a integração destrava": cada cartão leva à página da funcionalidade.
export function IntegrationUnlocks({ unlocks }: IntegrationUnlocksProps) {
	return (
		<section>
			<h2 className="m-0 max-w-[640px] text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[44px]">
				O que a integração destrava
			</h2>
			<div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-6">
				{unlocks.map((unlock) => {
					const Icon = getFeatureIcon(unlock.featureSlug);
					return (
						<Link
							key={unlock.featureSlug}
							href={`/features/${unlock.featureSlug}`}
							className="group flex flex-col gap-3.5 rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] sm:min-h-[240px] sm:p-7"
						>
							<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
								<Icon className="size-5" aria-hidden />
							</span>
							<h3 className="m-0 mt-2 text-xl font-semibold leading-[normal] tracking-[-0.02em]">{unlock.title}</h3>
							<p className="m-0 text-[15px] leading-[1.6] text-[#5b6a70]">{unlock.body}</p>
							<span className="mt-auto flex items-center justify-between border-t border-[#eef1f2] pt-4 text-sm font-medium leading-[normal] text-[#5b6a70] group-hover:text-[#0e1214]">
								Ver funcionalidade
								<ArrowUpRight
									className="size-[18px] text-[#8a979c] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
									aria-hidden
								/>
							</span>
						</Link>
					);
				})}
			</div>
		</section>
	);
}

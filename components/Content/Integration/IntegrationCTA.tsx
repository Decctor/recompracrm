import type { IntegrationPage } from "@/app/_content/integration-pages";
import { ArrowRight } from "lucide-react";
import { buildWhatsappUrl } from "./links";
import { TrackedLink } from "./TrackedLink";

// Cartão escuro de demonstração. `id="cta"` é o destino do "Agendar demonstração" do Dock, que
// também troca o CTA enquanto esta seção está em leitura.
export function IntegrationCTA({ page }: { page: IntegrationPage }) {
	return (
		<section
			id="cta"
			data-dock="dark"
			className="grid scroll-mt-[110px] grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-end gap-x-16 gap-y-8 rounded-[28px] bg-[#0b1628] px-6 py-12 text-white sm:px-12 sm:py-[72px]"
		>
			<div>
				<span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/8 px-3 text-[13px] font-medium leading-[normal] text-white/85">
					<span aria-hidden className="size-1.5 rounded-full bg-[#ffb900]" />
					Demonstração gratuita
				</span>
				<h2 className="m-0 mt-5 text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-balance sm:text-[40px]">{page.cta.headline}</h2>
			</div>
			<div>
				<p className="m-0 text-[17px] leading-[1.6] text-white/70">{page.cta.sub}</p>
				<TrackedLink
					href={buildWhatsappUrl(page.cta.whatsappMessage)}
					ctaId="integration_demo"
					location="cta"
					page={`integration_${page.slug}`}
					className="mt-6 inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-[#ffb900] px-[22px] text-[15px] font-semibold text-[#171717] transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-[#e6a700]"
				>
					{page.cta.buttonText}
					<ArrowRight className="size-4" aria-hidden />
				</TrackedLink>
			</div>
		</section>
	);
}

import type { FeaturePage } from "@/app/_content/feature-pages";
import { ArrowRight } from "lucide-react";
import { TrackedCta } from "./TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "./feature-links";

// Convite final, no painel escuro. O botão amarelo agenda a demonstração pelo WhatsApp com a mensagem
// da funcionalidade; o teste grátis fica ao lado para quem prefere começar sozinho.
export function FeatureCta({ page }: { page: FeaturePage }) {
	return (
		<section id="cta" className="scroll-mt-[60px] px-6 pt-32 max-sm:px-4 max-sm:pt-24">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-24 text-center text-white max-sm:rounded-[20px] max-sm:px-6 max-sm:py-16"
			>
				<h2 className="m-0 max-w-[760px] text-[52px] leading-[1.04] font-semibold tracking-[-0.04em] text-balance max-sm:text-[36px] max-sm:leading-[1.06]">
					{page.cta.headline}
				</h2>
				<p className="m-0 mt-5 max-w-[560px] text-[18px] leading-[1.6] text-white/70 max-sm:text-[17px]">{page.cta.sub}</p>
				<div className="mt-9 flex flex-wrap justify-center gap-3">
					<TrackedCta
						href={whatsappHref(page.cta.whatsappMessage)}
						slug={page.slug}
						ctaId="feature_cta_demo"
						location="feature_cta"
						className="inline-flex h-[52px] items-center gap-2 rounded-full bg-[#ffb900] px-6 text-[15px] font-semibold whitespace-nowrap text-[#171717] transition-colors hover:bg-[#ffc633]"
					>
						{page.cta.buttonText}
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href={SIGNUP_HREF}
						slug={page.slug}
						ctaId="feature_cta_testar_15_dias"
						location="feature_cta"
						className="inline-flex h-[52px] items-center rounded-full border border-white/20 px-6 text-[15px] font-medium whitespace-nowrap text-white transition-colors hover:bg-white/10"
					>
						Testar 15 dias grátis
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

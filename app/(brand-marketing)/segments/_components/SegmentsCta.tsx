import { ArrowRight } from "lucide-react";
import { SIGNUP_HREF, whatsappHref } from "./segment-families";
import { TrackedCta } from "./TrackedCta";

type SegmentsCtaProps = {
	headline: string;
	sub: string;
	buttonText: string;
	whatsappMessage: string;
	location: string;
	segment?: string;
};

// Convite final, no painel escuro: o botão amarelo agenda a demonstração pelo WhatsApp com a
// mensagem do segmento; o teste grátis fica ao lado para quem prefere começar sozinho.
export function SegmentsCta({ headline, sub, buttonText, whatsappMessage, location, segment }: SegmentsCtaProps) {
	return (
		<section id="cta" className="scroll-mt-[60px] px-6 pt-[120px] pb-6 max-md:px-3 max-md:pt-24 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-24 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<h2 className="max-w-[760px] text-[52px] leading-[1.04] font-semibold tracking-[-0.04em] text-balance max-md:text-[36px] max-md:leading-[1.06]">
					{headline}
				</h2>
				<p className="mt-5 max-w-[600px] text-[18px] leading-[1.6] text-white/70 max-md:text-[16px]">{sub}</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={whatsappHref(whatsappMessage)}
						ctaId="segments_cta_demo"
						location={location}
						segment={segment}
						className="inline-flex h-[52px] items-center gap-2 rounded-full bg-[#ffb900] px-6 text-[15px] font-semibold whitespace-nowrap text-[#171717] transition-colors hover:bg-[#ffc933]"
					>
						{buttonText}
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId="segments_cta_trial"
						location={location}
						segment={segment}
						className="inline-flex h-[52px] items-center rounded-full border border-white/20 px-6 text-[15px] font-medium whitespace-nowrap text-white transition-colors hover:bg-white/8"
					>
						Testar 15 dias grátis
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

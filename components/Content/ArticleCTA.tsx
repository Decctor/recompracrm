import { ArrowRight, Check } from "lucide-react";

type ArticleCTAProps = {
	headline: string;
	sub: string;
	buttonText: string;
	whatsappMessage: string;
};

// `id="cta"` é o destino do botão "Agendar demonstração" do Dock no artigo; `data-dock="dark"` faz o
// Dock escurecer enquanto passa por cima do cartão.
export function ArticleCTA({ headline, sub, buttonText, whatsappMessage }: ArticleCTAProps) {
	const whatsappUrl = `https://wa.me/553492465388?text=${encodeURIComponent(whatsappMessage)}`;

	return (
		<section id="cta" data-dock="dark" className="my-14 scroll-mt-[110px] rounded-[28px] bg-[#0b1628] px-7 py-10 text-white sm:p-12">
			<span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/8 px-3 text-[13px] font-medium text-white/85">
				<span aria-hidden className="size-1.5 rounded-full bg-[#ffb900]" />
				Demonstração gratuita
			</span>
			<h2 className="m-0 mt-5 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[34px]">{headline}</h2>
			<p className="m-0 mt-3 max-w-[52ch] text-[17px] leading-[1.6] text-white/70">{sub}</p>
			<a
				href={whatsappUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ffb900] px-[22px] py-3 text-[15px] font-semibold text-[#171717] transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-[#e6a700]"
			>
				{buttonText}
				<ArrowRight className="size-4 flex-none" aria-hidden />
			</a>
			<ul className="m-0 mt-7 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-white/60">
				{["Sem compromisso", "15 dias grátis", "Setup em menos de 1 dia"].map((item) => (
					<li key={item} className="flex items-center gap-1.5">
						<Check className="size-3.5 text-[#ffb900]" aria-hidden />
						{item}
					</li>
				))}
			</ul>
		</section>
	);
}

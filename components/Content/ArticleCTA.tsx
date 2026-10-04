import { IsoIcon } from "@/components/Illustrations/Isometric/IsoIcon";
import { ArrowRight, Check } from "lucide-react";

type ArticleCTAProps = {
	headline: string;
	sub: string;
	buttonText: string;
	whatsappMessage: string;
};

export function ArticleCTA({ headline, sub, buttonText, whatsappMessage }: ArticleCTAProps) {
	const whatsappUrl = `https://wa.me/553499480791?text=${encodeURIComponent(whatsappMessage)}`;

	return (
		<section className="relative my-16 overflow-hidden rounded-[26px] bg-[#1a3d7a] px-7 py-10 sm:px-10 sm:py-12">
			{/* Halo e pontos: o mesmo fundo das capas em tom profundo */}
			<div aria-hidden className="absolute -top-24 -right-24 size-80 rounded-full bg-[#24549C]" />
			<div className="relative grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_200px]">
				<div>
					<p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-label text-white/85">
						<span aria-hidden className="size-1.5 rounded-full bg-[#FFB900]" />
						Demonstração gratuita
					</p>
					<h2 className="mb-3 text-2xl font-extrabold leading-[1.15] tracking-[-0.015em] text-white text-balance sm:text-[30px]">{headline}</h2>
					<p className="mb-7 max-w-xl leading-relaxed text-white/75">{sub}</p>
					<a
						href={whatsappUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#FFB900] px-6 text-[15px] font-extrabold text-slate-900 shadow-[0_16px_40px_-12px_rgba(255,185,0,0.40),0_6px_12px_rgba(0,0,0,0.08)] transition-[transform,background-color] duration-300 hover:-translate-y-px hover:bg-[#e6a700]"
					>
						{buttonText}
						<ArrowRight className="size-5" aria-hidden />
					</a>
					<ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-white/60">
						{["Sem compromisso", "15 dias grátis", "Setup em menos de 1 dia"].map((item) => (
							<li key={item} className="flex items-center gap-1.5">
								<Check className="size-4 text-[#FFB900]" aria-hidden />
								{item}
							</li>
						))}
					</ul>
				</div>
				<IsoIcon icon="store" className="mx-auto hidden w-[200px] md:block" />
			</div>
		</section>
	);
}

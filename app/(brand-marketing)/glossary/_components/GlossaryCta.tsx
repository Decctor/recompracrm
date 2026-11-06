import { ArrowRight } from "lucide-react";
import { TrackedCta } from "../../features/_components/TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "../../features/_components/feature-links";

const WHATSAPP_TEXT = "Olá, vim do glossário do RecompraCRM e gostaria de falar com um especialista.";

// Fecho escuro do glossário: o mesmo bloco das páginas de solução, com o texto de quem chegou
// buscando uma definição e não um produto.
export function GlossaryCta({ slug }: { slug: string }) {
	const featureSlug = `glossary-${slug}`;
	return (
		<section id="cta" className="bg-white px-6 pb-6 max-md:px-3 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-24 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-16"
			>
				<h2 className="max-w-[760px] text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.04em] max-md:text-[34px]">
					Veja esses números da sua loja, sem planilha.
				</h2>
				<p className="mt-5 max-w-[560px] text-[18px] leading-[1.6] text-white/66 max-md:text-[16px]">
					O RecompraCRM liga cada venda ao cliente pelo telefone e mostra ticket médio, recompra e quem está sumindo, com cashback e WhatsApp para trazer
					de volta.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId="glossary_cta_trial"
						location="glossary_cta"
						slug={featureSlug}
						className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-[22px] text-[15px] font-medium text-[#0b1628] transition-colors hover:bg-[#eef2f6]"
					>
						Testar 15 dias grátis
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href={whatsappHref(WHATSAPP_TEXT)}
						ctaId="glossary_cta_especialista"
						location="glossary_cta"
						slug={featureSlug}
						className="inline-flex h-12 items-center rounded-full border border-white/20 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-white/8"
					>
						Falar com um especialista
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

import { TrackedAnchor, TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { HERO_STRIP_ORDER, LANDING_INTEGRATIONS } from "./integrations-data";
import { SIGNUP_HREF } from "./links";
import { Container, PILL_BUTTON } from "./primitives";

const CHIP =
	"absolute inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e8ea] bg-white px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:py-1.5 text-[#262626] shadow-[0_4px_12px_-6px_rgba(23,23,23,0.15)] sm:text-[12px]";
const ARC_LABEL =
	"absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-[#f3f6fb] px-2 py-0.5 text-[11px] font-bold tracking-[0.08em] uppercase sm:text-[12px]";

const stripIntegrations = HERO_STRIP_ORDER.map((slug) => LANDING_INTEGRATIONS.find((i) => i.slug === slug)).filter((i) => !!i);

function HeroIllustration() {
	// Desenho 2D em /public; os rótulos são texto da página por cima dele (posições em % do quadro 6:5).
	return (
		<div className="relative mx-auto aspect-[6/5] w-full max-w-[600px]">
			<Image src="/images/landing/hero-illustration.svg" alt="" fill priority unoptimized className="object-contain" />
			<span className={`${ARC_LABEL} top-[13.5%] text-[#24549c]`}>Fidelização</span>
			<span className={`${ARC_LABEL} top-[91.5%] text-[#5f7fb0]`}>Recuperação</span>
			<span className={`${CHIP} top-[46%] left-0`}>Compra registrada</span>
			<span className={`${CHIP} top-[43%] right-0`}>
				<span className="text-[#7a5117]">+ R$ 6,00</span> de cashback
			</span>
			<span className={`${CHIP} top-[80%] left-[2%]`}>Voltou ao balcão</span>
			<span className={`${CHIP} top-[86%] right-0`}>Sumiu há 60 dias · mensagem enviada</span>
		</div>
	);
}

export function LandingHero() {
	return (
		<section id="top" className="bg-white pt-[136px] pb-20 sm:pt-[168px] sm:pb-[104px]">
			<Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-center gap-14">
				<div className="max-w-[560px]">
					<span className="mb-7 inline-flex h-[30px] items-center gap-2 rounded-full border border-[#e3e8ea] pr-3 pl-1.5 text-[13px] font-medium whitespace-nowrap text-[#4b585d]">
						<span className="inline-flex h-5 items-center rounded-full bg-[#eef2f6] px-2 text-[11px] font-bold tracking-[0.04em] text-[#24549c]">CRM</span>
						Recompra para o varejo
					</span>
					<h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-[64px]">
						Fidelize quem compra. Recupere quem parou de comprar.
					</h1>
					<p className="mt-6 text-[17px] leading-[1.55] text-pretty text-[#5b6a70] sm:text-[18px]">
						O RecompraCRM lê as vendas da sua loja e trabalha em duas frentes: um programa de cashback que dá motivo para o cliente voltar, e campanhas no
						WhatsApp da loja para quem sumiu. Use as duas ou comece só pela recuperação.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<TrackedLink
							href={SIGNUP_HREF}
							event="landing_cta_clicked"
							controlEvent="lead"
							properties={{ cta_id: "hero_testar_15_dias", location: "hero" }}
							className={`${PILL_BUTTON} bg-[#24549c] text-white hover:bg-[#1a3d7a]`}
						>
							Testar 15 dias grátis
							<ArrowRight className="h-4 w-4" aria-hidden />
						</TrackedLink>
						<TrackedAnchor
							href="#cashback"
							event="landing_cta_clicked"
							properties={{ cta_id: "hero_ver_como_funciona", location: "hero" }}
							className={`${PILL_BUTTON} border border-[#dfe4e6] bg-white text-[#0e1214] hover:bg-[#f7f8fa]`}
						>
							Ver como funciona
						</TrackedAnchor>
					</div>
					<p className="mt-4 text-[13px] text-[#687a80]">Sem cartão de crédito · Configuração em um dia · Suporte humano</p>
				</div>

				<HeroIllustration />
			</Container>

			<Container className="mt-16">
				<div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-[#e3e8ea] pt-6">
					<p className="text-[13px] text-[#687a80]">Importa vendas de</p>
					<div className="flex flex-wrap items-center gap-x-9 gap-y-4">
						{stripIntegrations.map((integration) => (
							<Image
								key={integration.slug}
								src={integration.logo}
								alt={integration.name}
								className={`h-6 w-auto object-contain opacity-60 grayscale ${integration.stripMaxWidth}`}
								sizes="110px"
							/>
						))}
					</div>
				</div>
			</Container>
		</section>
	);
}

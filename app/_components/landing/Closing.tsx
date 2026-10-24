import { TrackedAnchor, TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { BrandLogo } from "@/components/Brand/BrandLogo";
import Link from "next/link";
import { ERP_HREF, SIGNIN_HREF, SIGNUP_HREF, WHATSAPP_SPECIALIST } from "./links";
import { PILL_BUTTON } from "./primitives";

const COPYRIGHT_YEAR = new Date().getFullYear();

const FOOTER_GROUPS = [
	{
		title: "Produto",
		links: [
			{ label: "Fidelização", href: "#frentes" },
			{ label: "Recuperação", href: "#frentes" },
			{ label: "Ponto de Interação", href: "/features/ponto-de-interacao" },
			{ label: "ERP", href: ERP_HREF },
			{ label: "Planos", href: "#planos" },
		],
	},
	{
		title: "Conteúdo",
		links: [
			{ label: "Blog", href: "/blog" },
			{ label: "Segmentos", href: "/segmentos" },
			{ label: "Integrações", href: "/integrations" },
			{ label: "Parcerias", href: "/partnerships" },
		],
	},
	{
		title: "Conta e legal",
		links: [
			{ label: "Entrar", href: SIGNIN_HREF },
			{ label: "Criar conta", href: SIGNUP_HREF },
			{ label: "Termos de uso", href: "/legal" },
			{ label: "Privacidade", href: "/legal" },
		],
	},
];

export function LandingClosingCta() {
	return (
		<section id="contato" className="bg-white px-3 text-white sm:px-6">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-wrap items-center justify-between gap-8 rounded-[28px] bg-[#0b1628] px-6 py-16 sm:px-16 sm:py-[104px]"
			>
				<div className="max-w-[620px]">
					<h2 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">
						Sua loja já tem clientes. Agora faça eles voltarem.
					</h2>
					<p className="mt-4 text-[17px] leading-[1.6] text-white/80">
						Configure hoje, atenda o balcão amanhã e acompanhe os primeiros retornos no painel.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<TrackedLink
						href={SIGNUP_HREF}
						event="landing_cta_clicked"
						controlEvent="lead"
						properties={{ cta_id: "closing_testar_15_dias", location: "closing_cta" }}
						className={`${PILL_BUTTON} bg-white text-[#0b1628] hover:bg-[#eef2f6]`}
					>
						Testar 15 dias grátis
					</TrackedLink>
					<TrackedAnchor
						href={WHATSAPP_SPECIALIST}
						target="_blank"
						rel="noopener noreferrer"
						event="landing_cta_clicked"
						controlEvent="contact"
						properties={{ cta_id: "closing_falar_com_especialista", location: "closing_cta" }}
						className={`${PILL_BUTTON} border border-white/20 text-white hover:bg-white/10`}
					>
						Falar com especialista
					</TrackedAnchor>
				</div>
			</div>
		</section>
	);
}

export function LandingFooter() {
	return (
		<footer data-dock="dark" className="mt-6 bg-[#0b1628] text-white/85">
			<div className="mx-auto max-w-[1200px] px-6 pt-16 pb-8">
				<div className="grid grid-cols-2 gap-8 border-b border-white/10 pb-10 md:grid-cols-5">
					<div className="col-span-2 max-w-[360px] min-w-0">
						<BrandLogo lockup="horizontal" tone="white" className="h-[26px] w-auto" />
						<p className="mt-4 text-[14px] leading-[1.6] text-white/60">
							CRM de fidelização e recuperação de clientes para o varejo brasileiro, com ERP próprio para quem quer tudo em um sistema.
						</p>
					</div>
					{FOOTER_GROUPS.map((group) => (
						<div key={group.title}>
							<p className="mb-3.5 text-[13px] font-semibold text-white">{group.title}</p>
							<ul className="flex flex-col gap-2.5">
								{group.links.map((link) => (
									<li key={link.label}>
										<Link href={link.href} className="text-[14px] text-white/60 transition-colors hover:text-white">
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="flex flex-wrap justify-between gap-3 pt-6 text-[13px] text-white/45">
					<span>© {COPYRIGHT_YEAR} RecompraCRM</span>
					<span>LGPD · Pagamento via Stripe · Suporte humano</span>
				</div>
			</div>
		</footer>
	);
}

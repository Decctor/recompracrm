"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { ArrowRight, Lock, MessageCircle, Shield } from "lucide-react";
import Link from "next/link";
import { LandingArt } from "./_primitives/LandingArt";
import { Reveal } from "./_primitives/Reveal";

const FOOTER_GROUPS = [
	{
		title: "Produto",
		links: [
			{ label: "Funcionalidades", href: "#inventario" },
			{ label: "Como funciona", href: "#como-funciona" },
			{ label: "Resultado real", href: "#movimento" },
			{ label: "Planos", href: "#saldo" },
			{ label: "Parcerias", href: "/partnerships" },
		],
	},
	{
		title: "Funcionalidades",
		links: [
			{ label: "Cashback e Pontos", href: "/features/programa-de-cashback" },
			{ label: "Campanhas WhatsApp", href: "/features/campanhas-whatsapp" },
			{ label: "Ponto de Interação", href: "/features/ponto-de-interacao" },
			{ label: "Business Intelligence", href: "/features/business-intelligence" },
		],
	},
	{
		title: "Conteúdo",
		links: [
			{ label: "Blog", href: "/blog" },
			{ label: "Todos os segmentos", href: "/segments" },
			{ label: "Restaurantes", href: "/segments/restaurantes" },
			{ label: "Pet Shops", href: "/segments/pet-shop" },
			{ label: "Lojas de Roupas", href: "/segments/loja-de-roupas" },
		],
	},
	{
		title: "Conta & Legal",
		links: [
			{ label: "Login da organização", href: "/auth/signin" },
			{ label: "Criar conta", href: "/auth/signup" },
			{ label: "Termos de uso", href: "/legal" },
			{ label: "Política de privacidade", href: "/legal" },
		],
	},
];

export function LedgerClosingCTA() {
	return (
		<section id="contato" className="ledger-deferred relative py-20 lg:py-28 overflow-hidden bg-gradient-to-br from-[#24549c] to-[#1a3d7a] text-white">
			{/* decorative blobs */}
			<div
				className="ledger-ambient absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-[#ffb900]/12 blur-[120px] pointer-events-none"
				aria-hidden
			/>
			<div
				className="ledger-ambient absolute -bottom-40 -left-32 w-[400px] h-[400px] rounded-full bg-white/6 blur-[100px] pointer-events-none"
				aria-hidden
			/>

			<div className="relative mx-auto max-w-5xl px-5 lg:px-8 text-center">
				<Reveal>
					<div className="ledger-fade mx-auto mb-6 w-[200px] sm:w-[240px] lg:w-[280px]" style={{ "--i": 0 } as React.CSSProperties} data-stagger>
						<LandingArt src="/images/onboarding/storefront.png" sizes="(max-width: 1023px) 240px, 280px" glow={false}>
							<span
								className="absolute left-[29%] top-[14%] w-[34%] -rotate-[4deg] overflow-hidden text-ellipsis whitespace-nowrap text-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#24549c] sm:text-[11px] lg:text-[13px]"
								aria-hidden
							>
								Sua loja
							</span>
						</LandingArt>
					</div>
					<div className="inline-flex items-center justify-center gap-3 mb-7 rounded-full bg-white/12 border border-white/20 px-4 py-1.5">
						<span className="ledger-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-[#ffb900]" />
						<span className="text-[11px] font-extrabold tracking-[0.14em] uppercase text-white/90">Pronto para reter seus clientes?</span>
					</div>

					<h2 className="font-extrabold text-white tracking-[-0.025em] leading-[1.0] text-[40px] sm:text-[54px] lg:text-[72px] max-w-[18ch] mx-auto">
						<span className="block ledger-write" style={{ "--i": 1 } as React.CSSProperties} data-stagger>
							Sua loja já tem clientes.
						</span>
						<span className="block mt-2 lg:mt-3 ledger-fade text-[#ffb900]" style={{ "--i": 4 } as React.CSSProperties} data-stagger>
							Agora faça eles voltarem.
						</span>
					</h2>

					<p
						className="ledger-fade mt-7 text-[15px] lg:text-[18px] text-white/75 max-w-[52ch] mx-auto"
						style={{ "--i": 7 } as React.CSSProperties}
						data-stagger
					>
						Configure hoje, atenda o balcão amanhã e veja os primeiros retornos antes do fim do mês.
					</p>

					<div
						className="ledger-fade mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
						style={{ "--i": 9 } as React.CSSProperties}
						data-stagger
					>
						<a
							href="https://wa.me/553499480791?text=Olá, gostaria de falar com um especialista do RecompraCRM."
							target="_blank"
							rel="noopener noreferrer"
							onClick={() =>
								captureClientEvent({
									event: "landing_cta_clicked",
									controlEvent: "contact",
									properties: { cta_id: "footer_falar_com_especialista", location: "footer" },
								})
							}
							className="group inline-flex items-center gap-2 bg-[#ffb900] hover:bg-[#e6a700] text-[#171717] px-7 py-4 rounded-2xl text-[14px] font-extrabold tracking-[0.04em] uppercase shadow-[0_16px_40px_-12px_rgba(255,185,0,0.5),0_6px_12px_rgba(0,0,0,0.18)] hover:shadow-[0_22px_48px_-10px_rgba(255,185,0,0.6),0_8px_16px_rgba(0,0,0,0.22)] hover:-translate-y-0.5 transition-all duration-200"
						>
							Falar com especialista
							<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
						</a>
						<a
							href="#saldo"
							onClick={() =>
								captureClientEvent({
									event: "landing_cta_clicked",
									controlEvent: "lead",
									properties: { cta_id: "footer_ver_planos", location: "footer" },
								})
							}
							className="inline-flex items-center gap-2 bg-white/12 hover:bg-white/20 border border-white/25 text-white px-7 py-4 rounded-2xl text-[14px] font-bold tracking-[0.02em] transition-all duration-200"
						>
							Ver planos
						</a>
					</div>

					<div
						className="ledger-fade mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[12px] text-white/65 font-semibold"
						style={{ "--i": 12 } as React.CSSProperties}
						data-stagger
					>
						<span className="inline-flex items-center gap-1.5">
							<span className="text-[#ffb900] font-extrabold">✓</span>15 dias grátis
						</span>
						<span className="inline-flex items-center gap-1.5">
							<span className="text-[#ffb900] font-extrabold">✓</span>Sem cartão de crédito
						</span>
						<span className="inline-flex items-center gap-1.5">
							<span className="text-[#ffb900] font-extrabold">✓</span>Cancele quando quiser
						</span>
						<span className="inline-flex items-center gap-1.5">
							<span className="text-[#ffb900] font-extrabold">✓</span>Suporte humano incluso
						</span>
					</div>
				</Reveal>
			</div>
		</section>
	);
}

export function LedgerFooter() {
	return (
		<footer className="bg-[#0f1f3a] text-white/85">
			<div className="mx-auto max-w-7xl px-5 lg:px-8 py-14 lg:py-20">
				{/* Top signature row */}
				<div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 pb-10 border-b border-white/10">
					<div className="max-w-md">
						<p className="text-[11px] font-extrabold tracking-[0.16em] uppercase text-[#ffb900] mb-3">RecompraCRM</p>
						<p className="font-extrabold text-[28px] leading-[1.1] tracking-[-0.02em] text-white mb-4">Retenção e fidelização para o varejo brasileiro.</p>
						<p className="text-[14px] text-white/65 leading-relaxed">
							Cashback no balcão, WhatsApp automático e inteligência de base — feito para lojas que vendem todo dia e querem que o cliente volte amanhã.
						</p>
					</div>
				</div>

				{/* Link groups */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-10 border-b border-white/10">
					{FOOTER_GROUPS.map((group, gi) => (
						<div key={group.title}>
							<div className="flex items-center gap-2 mb-4">
								<span className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-white/40 ledger-tabular">{String(gi + 1).padStart(2, "0")}</span>
								<p className="text-[11px] font-extrabold tracking-[0.16em] uppercase text-white">{group.title}</p>
							</div>
							<ul className="space-y-2.5">
								{group.links.map((link) => (
									<li key={link.href + link.label}>
										<Link href={link.href} className="text-[13px] text-white/65 hover:text-[#ffb900] transition-colors leading-tight">
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				{/* Trust strip */}
				<div className="flex flex-wrap items-center justify-center gap-6 py-7 border-b border-white/10 text-[11px] uppercase tracking-[0.12em] font-bold text-white/55">
					<span className="inline-flex items-center gap-2">
						<Lock className="h-3.5 w-3.5" />
						LGPD · dados protegidos
					</span>
					<span className="inline-flex items-center gap-2">
						<Shield className="h-3.5 w-3.5" />
						Pagamento Stripe
					</span>
					<span className="inline-flex items-center gap-2">
						<MessageCircle className="h-3.5 w-3.5" />
						Suporte humano comercial
					</span>
				</div>

				{/* Bottom signature */}
				<div className="pt-7 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] uppercase tracking-[0.1em] font-bold text-white/45">
					<p>© {new Date().getFullYear()} RecompraCRM · Todos os direitos reservados.</p>
				</div>
			</div>
		</footer>
	);
}

import { TrackedAnchor, TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { ArrowRight, FileInput, Globe, Monitor, Receipt, UtensilsCrossed } from "lucide-react";
import { ERP_HREF, WHATSAPP_ERP } from "./links";
import { Container, PILL_BUTTON, SectionTitle } from "./primitives";

const MODULES = [
	{ icon: Monitor, title: "PDV e frente de caixa", text: "Venda no balcão com cashback e cupons aplicados na mesma tela." },
	{ icon: Receipt, title: "Emissão fiscal", text: "NFC-e e NF-e emitidas a partir da venda confirmada." },
	{ icon: FileInput, title: "Compras por XML", text: "Entrada de nota de fornecedor atualiza estoque e custo." },
	{ icon: UtensilsCrossed, title: "Comandas e mesas", text: "Pedidos por mesa ou comanda, fechados em uma única venda." },
	{ icon: Globe, title: "Loja digital e cardápio", text: "Pedidos online com resgate de cashback no checkout." },
];

export function LandingErp() {
	return (
		<section id="erp" data-dock="dark" className="bg-[#0b1628] py-24 text-white sm:py-[136px]">
			<Container>
				<div className="mb-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-12">
					<div>
						<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">03 · ERP RecompraCRM</p>
						<SectionTitle>Ou use o RecompraCRM como seu ERP.</SectionTitle>
					</div>
					<p className="text-[17px] leading-[1.6] text-pretty text-white/75">
						Para lojas que querem vender, emitir nota e fidelizar no mesmo sistema. A venda nasce aqui, então cashback, resgate e campanhas já partem dela,
						sem integração e sem lançar desconto em dois lugares.
					</p>
				</div>

				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
					{MODULES.map(({ icon: Icon, title, text }) => (
						<div key={title} className="rounded-xl border border-white/12 p-6">
							<Icon className="h-[22px] w-[22px] text-[#9db6dd]" aria-hidden />
							<p className="mt-4 text-[16px] font-semibold">{title}</p>
							<p className="mt-1.5 text-[14px] leading-[1.55] text-white/65">{text}</p>
						</div>
					))}
				</div>

				<div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
					<div className="rounded-xl border border-white/12 px-6 py-5">
						<p className="text-[12px] font-bold tracking-[0.08em] text-white/55 uppercase">Com o seu ERP</p>
						<p className="mt-2 text-[15px] leading-[1.55] text-white/85">
							Vendas chegam por integração. O resgate é autorizado no Ponto de Interação e o desconto é lançado no seu caixa.
						</p>
					</div>
					<div className="rounded-xl border border-[rgba(157,182,221,0.4)] bg-[rgba(36,84,156,0.25)] px-6 py-5">
						<p className="text-[12px] font-bold tracking-[0.08em] text-[#9db6dd] uppercase">Com o ERP RecompraCRM</p>
						<p className="mt-2 text-[15px] leading-[1.55] text-white">
							A venda já nasce no CRM. O cashback é creditado e resgatado no próprio PDV, junto da emissão fiscal.
						</p>
					</div>
				</div>

				<div className="mt-8 flex flex-wrap items-center gap-4">
					<TrackedAnchor
						href={WHATSAPP_ERP}
						target="_blank"
						rel="noopener noreferrer"
						event="landing_cta_clicked"
						controlEvent="contact"
						properties={{ cta_id: "erp_falar_sobre_erp", location: "erp" }}
						className={`${PILL_BUTTON} bg-white text-[#0f1f3a] hover:bg-[#eef2f6]`}
					>
						Falar sobre o ERP
						<ArrowRight className="h-4 w-4" aria-hidden />
					</TrackedAnchor>
					<TrackedLink
						href={ERP_HREF}
						event="landing_cta_clicked"
						properties={{ cta_id: "erp_conhecer_em_detalhe", location: "erp" }}
						className="px-1 py-[13px] text-[15px] font-semibold text-white hover:text-white/80"
					>
						Conhecer o ERP em detalhe
					</TrackedLink>
				</div>
			</Container>
		</section>
	);
}

import { TrackedAnchor, TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { SIGNUP_HREF, WHATSAPP_CONSULTORIA, WHATSAPP_ERP } from "./links";
import { Eyebrow, SectionTitle } from "./primitives";

// Preços e listas iguais aos da landing anterior (app/_components/ledger/Pricing.tsx).

const PLATFORM_INCLUDED = [
	"Ponto de Interação (tablet + QR Code)",
	"Programa de cashback configurável",
	"WhatsApp automático ilimitado",
	"Campanhas com filtro de audiência",
	"Painel de clientes em risco (RFM)",
	"Business Intelligence de vendas",
	"Suporte humano incluso",
];

const CONSULTORIA_INCLUDED = [
	"Um gestor de crescimento dedicado ao seu negócio",
	"Importação e integração dos seus dados de venda",
	"Criação e gestão das suas campanhas, ponta a ponta",
	"Diagnóstico inicial com metas definidas junto com você",
	"Relatório de resultado e acompanhamento todo mês",
];

function Price({ value }: { value: string }) {
	return (
		<p className="mt-6 flex items-baseline gap-1">
			<span className="text-[16px] font-semibold text-[#5b6a70]">R$</span>
			<span className="text-[48px] font-bold leading-none tracking-[-0.03em]">{value}</span>
			<span className="text-[14px] text-[#687a80]">/mês</span>
		</p>
	);
}

function Included({ items, className }: { items: string[]; className?: string }) {
	return (
		<ul className={`mb-8 flex flex-1 flex-col gap-2.5 ${className ?? ""}`}>
			{items.map((item) => (
				<li key={item} className="flex gap-2.5 text-[14px] text-[#262626]">
					<Check className="mt-0.5 h-4 w-4 shrink-0 text-[#24549c]" strokeWidth={2.25} aria-hidden />
					{item}
				</li>
			))}
		</ul>
	);
}

function PlanCard({ highlighted, children }: { highlighted?: boolean; children: ReactNode }) {
	return (
		<div
			className={
				highlighted
					? "flex flex-col rounded-xl border border-[#24549c] bg-white p-6 shadow-[0_0_0_1px_#24549c] sm:p-8"
					: "flex flex-col rounded-xl border border-[#e3e8ea] bg-white p-6 sm:p-8"
			}
		>
			{children}
		</div>
	);
}

export function LandingPricing() {
	return (
		<section id="planos" className="bg-white py-24 sm:py-[136px]">
			<div className="mx-auto max-w-[1040px] px-6">
				<div className="mx-auto mb-12 max-w-[620px] text-center">
					<Eyebrow>06 · Planos</Eyebrow>
					<SectionTitle>Você opera. Ou a gente opera por você.</SectionTitle>
					<p className="mt-4 text-[17px] leading-[1.6] text-[#5b6a70]">Mesma plataforma completa nos dois. A diferença é quem coloca a mão na massa.</p>
				</div>

				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
					<PlanCard>
						<p className="text-[16px] font-semibold">Plataforma</p>
						<p className="mt-1 text-[14px] text-[#687a80]">Você no controle.</p>
						<Price value="399,90" />
						<p className="mt-2 text-[13px] text-[#687a80]">15 dias grátis</p>
						<Included items={PLATFORM_INCLUDED} className="mt-7" />
						<TrackedLink
							href={SIGNUP_HREF}
							event="landing_cta_clicked"
							controlEvent="lead"
							properties={{ cta_id: "pricing_comecar_agora", location: "pricing" }}
							className="flex justify-center rounded-[10px] border border-[#dfe4e6] p-[13px] text-[15px] font-semibold text-[#0e1214] transition-colors hover:bg-[#f7f8fa]"
						>
							Começar agora
						</TrackedLink>
					</PlanCard>

					<PlanCard highlighted>
						<div className="flex items-center justify-between gap-3">
							<p className="text-[16px] font-semibold">Plataforma + Gestor de Crescimento</p>
							<span className="rounded-md bg-[rgba(36,84,156,0.08)] px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap text-[#24549c]">
								Recomendado
							</span>
						</div>
						<p className="mt-1 text-[14px] text-[#687a80]">A gente opera por você.</p>
						<Price value="899,90" />
						<p className="mt-2 text-[13px] text-[#687a80]">Plataforma + consultoria</p>
						<p className="mt-7 mb-2.5 text-[12px] font-semibold tracking-[0.04em] text-[#687a80] uppercase">Tudo da Plataforma, mais:</p>
						<Included items={CONSULTORIA_INCLUDED} />
						<TrackedAnchor
							href={WHATSAPP_CONSULTORIA}
							target="_blank"
							rel="noopener noreferrer"
							event="landing_cta_clicked"
							controlEvent="contact"
							properties={{ cta_id: "pricing_agendar_diagnostico", location: "pricing" }}
							className="flex justify-center rounded-[10px] bg-[#24549c] p-[13px] text-[15px] font-semibold text-white transition-colors hover:bg-[#1a3d7a]"
						>
							Agendar diagnóstico
						</TrackedAnchor>
					</PlanCard>
				</div>

				<div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e3e8ea] bg-white px-6 py-5">
					<div>
						<p className="text-[15px] font-semibold">ERP RecompraCRM</p>
						<p className="mt-1 text-[14px] text-[#5b6a70]">
							PDV, emissão fiscal, compras, comandas e loja digital. Proposta sob medida para a sua operação.
						</p>
					</div>
					<TrackedAnchor
						href={WHATSAPP_ERP}
						target="_blank"
						rel="noopener noreferrer"
						event="landing_cta_clicked"
						controlEvent="contact"
						properties={{ cta_id: "pricing_erp_falar_com_a_gente", location: "pricing" }}
						className="inline-flex items-center gap-1.5 text-[15px] font-semibold whitespace-nowrap text-[#24549c] hover:text-[#1a3d7a]"
					>
						Falar com a gente
						<ArrowRight className="h-4 w-4" aria-hidden />
					</TrackedAnchor>
				</div>
				<p className="mt-5 text-center text-[13px] text-[#687a80]">Sem cartão de crédito · Cancele quando quiser · Sem taxa de setup</p>
			</div>
		</section>
	);
}

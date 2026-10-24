import { TrackedAnchor, TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, Handshake, ShieldCheck, Sparkles } from "lucide-react";
import {
	COMMISSIONABLE_MONTHLY_BASE,
	FIRST_INVOICE_PERCENT,
	FIRST_MONTH_PAYOUT,
	FIRST_YEAR_PAYOUT,
	PARTNER_CTA_EVENT,
	PARTNER_LOGIN_HREF,
	RECURRING_MONTH_PAYOUT,
	SUBSEQUENT_INVOICE_PERCENT,
	THIRD_INVOICE_PERCENT,
	THIRD_MONTH_PAYOUT,
} from "./program-facts";

const HERO_TRUST = ["Painel próprio de acompanhamento", "Pagamento mensal via PIX", "Sem custo para participar"];

// Extrato ilustrativo de uma loja: 1º e 3º mês são bônus cheios, os demais são recorrência.
const STATEMENT_ROWS = [
	{ month: "1º mês", detail: `${FIRST_INVOICE_PERCENT}% da mensalidade`, value: FIRST_MONTH_PAYOUT, highlight: true },
	{ month: "2º mês", detail: `${SUBSEQUENT_INVOICE_PERCENT}% recorrente`, value: RECURRING_MONTH_PAYOUT, highlight: false },
	{ month: "3º mês", detail: `${THIRD_INVOICE_PERCENT}% bônus de permanência`, value: THIRD_MONTH_PAYOUT, highlight: true },
	{ month: "4º mês", detail: `${SUBSEQUENT_INVOICE_PERCENT}% recorrente`, value: RECURRING_MONTH_PAYOUT, highlight: false },
];

export function PartnersHero() {
	return (
		<header id="top" className="pt-[168px] max-md:pt-32">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-center gap-x-[72px] gap-y-14 px-6 max-md:gap-y-12 max-md:px-4">
				<div>
					<span className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-full border border-[#e3e8ea] pr-3 pl-1.5 text-[13px] font-medium text-[#4b585d]">
						<span className="flex size-5 items-center justify-center rounded-full bg-[#ffb900] text-[#171717]">
							<Handshake className="size-3" aria-hidden />
						</span>
						Programa de parcerias
					</span>
					<h1 className="mt-7 text-[68px] font-semibold leading-[1.02] tracking-[-0.045em] max-lg:text-[56px] max-md:text-[42px] max-[400px]:text-[38px]">
						Indique lojas.
						<br />
						<span className="text-[#687a80]">Ganhe enquanto elas recompram.</span>
					</h1>
					<p className="mt-6 max-w-[54ch] text-pretty text-[18px] leading-[1.6] text-[#5b6a70] max-md:text-[17px]">
						Se você atende lojistas, presta consultoria ou já recomenda ferramentas pra vender mais, o RecompraCRM transforma cada indicação em receita
						recorrente, com painel próprio e pagamento mensal.
					</p>
					<div className="mt-8 flex flex-wrap gap-2.5">
						<TrackedLink
							href={PARTNER_LOGIN_HREF}
							event={PARTNER_CTA_EVENT}
							controlEvent="lead"
							properties={{ cta_id: "hero_entrar_no_programa", location: "partner_hero" }}
							className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-[#0e1214] px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-[#24303a]"
						>
							Entrar no programa
							<ArrowRight className="size-4 flex-none" aria-hidden />
						</TrackedLink>
						<TrackedAnchor
							href="#como-funciona-parceria"
							event={PARTNER_CTA_EVENT}
							properties={{ cta_id: "hero_ver_como_funciona", location: "partner_hero" }}
							className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-[#e3e8ea] px-[22px] text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
						>
							Ver como funciona
						</TrackedAnchor>
					</div>
					<ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-[#5b6a70]">
						{HERO_TRUST.map((item) => (
							<li key={item} className="flex items-center gap-1.5">
								<Check className="size-3.5 flex-none text-[#24549c]" aria-hidden />
								{item}
							</li>
						))}
					</ul>
				</div>

				<div className="rounded-[28px] bg-[#eef2f6] p-10 max-md:rounded-[20px] max-md:p-3">
					<div className="overflow-hidden rounded-[20px] border border-[#0e1214]/8 bg-white shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)] max-md:rounded-2xl">
						<div className="flex items-center justify-between gap-3 border-b border-[#eef1f2] px-6 py-5 max-md:px-4">
							<div>
								<p className="text-[12px] font-semibold text-[#687a80]">Extrato do parceiro</p>
								<p className="mt-1 text-[18px] font-semibold tracking-[-0.015em]">Uma loja indicada</p>
							</div>
							<span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#24549c]/10 px-3 text-[12px] font-semibold text-[#24549c]">
								<ShieldCheck className="size-[13px]" aria-hidden />
								Recorrente
							</span>
						</div>
						{STATEMENT_ROWS.map((row) => (
							<div key={row.month} className="flex items-center justify-between gap-3 border-b border-[#f2f4f4] px-6 py-4 max-md:px-4">
								<div>
									<p className="text-[14px] font-semibold">{row.month}</p>
									<p className="mt-0.5 text-[13px] text-[#687a80]">{row.detail}</p>
								</div>
								<span
									className={cn(
										"inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-[15px] font-semibold",
										row.highlight ? "bg-[#ffb900] text-[#171717]" : "text-[#24549c]",
									)}
								>
									{formatToMoney(row.value)}
								</span>
							</div>
						))}
						<div className="flex items-center justify-between gap-3 bg-[#0b1628] px-6 py-[18px] text-white max-md:px-4">
							<span className="flex items-center gap-2 text-[13px] font-semibold text-white/70">
								<Sparkles className="size-[15px] text-[#ffb900]" aria-hidden />
								No 1º ano
							</span>
							<span className="text-[24px] font-semibold tracking-[-0.02em]">{formatToMoney(FIRST_YEAR_PAYOUT)}</span>
						</div>
					</div>
					<p className="mx-1 mt-4 text-[12px] leading-[1.5] text-[#687a80]">
						Estimativa por loja ativa sobre a base de {formatToMoney(COMMISSIONABLE_MONTHLY_BASE)}/mês. Multiplique pelo número de lojas que você indicar.
					</p>
				</div>
			</div>
		</header>
	);
}

import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { BadgeDollarSign, CalendarClock, Landmark, Receipt } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import {
	COMMISSIONABLE_MONTHLY_BASE,
	FIRST_INVOICE_PERCENT,
	FIRST_MONTH_PAYOUT,
	RECURRING_MONTH_PAYOUT,
	SUBSEQUENT_INVOICE_PERCENT,
	THIRD_INVOICE_PERCENT,
	THIRD_MONTH_PAYOUT,
	YEARLY_INVOICE_PERCENT,
} from "./program-facts";

const TIERS = [
	{
		label: "Primeira mensalidade",
		percent: FIRST_INVOICE_PERCENT,
		caption: "Plano mensal",
		helper: "Assim que o primeiro pagamento é confirmado, a mensalidade inteira vai pra você.",
		amount: `${formatToMoney(FIRST_MONTH_PAYOUT)} por loja`,
		featured: true,
	},
	{
		label: "Terceira mensalidade",
		percent: THIRD_INVOICE_PERCENT,
		caption: "Plano mensal",
		helper: "Bônus de permanência quando o cliente indicado chega à terceira mensalidade paga.",
		amount: `${formatToMoney(THIRD_MONTH_PAYOUT)} por loja`,
		featured: true,
	},
	{
		label: "Demais mensalidades",
		percent: SUBSEQUENT_INVOICE_PERCENT,
		caption: "Plano mensal",
		helper: "Recorrente, mês após mês, enquanto a loja continuar ativa na plataforma.",
		amount: `${formatToMoney(RECURRING_MONTH_PAYOUT)} por loja/mês`,
		featured: false,
	},
	{
		label: "Planos anuais",
		percent: YEARLY_INVOICE_PERCENT,
		caption: "Pagamento à vista",
		helper: "Quando a loja fecha no plano anual, você recebe uma comissão única sobre a fatura.",
		amount: "Sobre a fatura anual",
		featured: false,
	},
];

const PAYOUT = [
	{ icon: CalendarClock, title: "Apuração mensal", text: "O financeiro fecha as comissões elegíveis todo mês." },
	{ icon: Landmark, title: "Repasse via PIX", text: "Pagamento na chave PIX cadastrada no seu perfil de parceiro." },
	{ icon: Receipt, title: "Comprovante anexado", text: "Cada pagamento fica no seu painel com o comprovante do repasse." },
];

export function PartnersPayment() {
	return (
		<section id="esquema-de-pagamento" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-20">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-x-16 gap-y-6">
					<SectionHeading
						tone="dark"
						eyebrow="02 · Esquema de pagamento"
						title={`${FIRST_INVOICE_PERCENT}% no primeiro mês.`}
						muted={`E ${THIRD_INVOICE_PERCENT}% no terceiro.`}
					/>
					<p className="max-w-[56ch] text-[17px] leading-[1.6] text-white/66 max-md:text-[16px]">
						A comissão incide sobre a mensalidade do plano da plataforma, hoje{" "}
						<span className="whitespace-nowrap">{formatToMoney(COMMISSIONABLE_MONTHLY_BASE)}</span>. Serviços de consultoria e adicionais não entram na
						base.
					</p>
				</div>

				<div className="mt-16 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-px overflow-hidden rounded-[20px] border border-white/8 bg-white/8 max-md:mt-10">
					{TIERS.map((tier) => (
						<div key={tier.label} className="flex min-h-[340px] flex-col bg-[#0b1628] p-7 max-md:min-h-0 max-md:p-6">
							<div className="flex min-h-[26px] items-center justify-between gap-2">
								<span className="text-[13px] font-semibold text-white/50">{tier.caption}</span>
								{tier.featured ? (
									<span className="inline-flex h-6 items-center gap-1 rounded-full bg-[#ffb900] px-2.5 text-[11px] font-bold text-[#171717]">
										<BadgeDollarSign className="size-3" aria-hidden />
										BÔNUS
									</span>
								) : null}
							</div>
							<span
								className={cn(
									"mt-8 text-[80px] font-medium leading-[0.9] tracking-[-0.055em] max-md:mt-6 max-md:text-[64px]",
									tier.featured ? "text-[#ffb900]" : "text-white",
								)}
							>
								{tier.percent}%
							</span>
							<p className="mt-4 text-[17px] font-semibold">{tier.label}</p>
							<p className="mt-1.5 text-[14px] leading-[1.6] text-white/62">{tier.helper}</p>
							<div className="mt-auto pt-6">
								<span className="inline-flex h-8 items-center rounded-full bg-white/8 px-3 text-[13px] font-semibold text-white">{tier.amount}</span>
							</div>
						</div>
					))}
				</div>

				<div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-10 gap-y-6">
					{PAYOUT.map((item) => (
						<div key={item.title} className="flex gap-3.5 border-t border-white/12 pt-5">
							<span className="flex size-10 flex-none items-center justify-center rounded-full bg-[#ffb900]/14 text-[#ffb900]">
								<item.icon className="size-[18px]" aria-hidden />
							</span>
							<div>
								<p className="text-[15px] font-semibold">{item.title}</p>
								<p className="mt-1 text-[14px] leading-[1.55] text-white/60">{item.text}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

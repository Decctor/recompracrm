import { CalendarCheck, Link2, MousePointerClick, ReceiptText } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { ATTRIBUTION_DAYS } from "./program-facts";

const STEPS = [
	{
		icon: Link2,
		title: "Pegue seu link",
		text: "Ao entrar no programa você recebe um código e um link de indicação exclusivos no seu painel.",
	},
	{
		icon: ReceiptText,
		title: "Indique o lojista",
		text: "Compartilhe com lojas do seu relacionamento. O cliente chega pelo seu link ou informa seu código no cadastro.",
	},
	{
		icon: CalendarCheck,
		title: "Receba todo mês",
		text: "Quando a loja paga a mensalidade, a comissão entra no seu extrato e é repassada via PIX.",
	},
];

const ATTRIBUTION = [
	{
		icon: MousePointerClick,
		title: "Janela de atribuição",
		text: `A indicação fica registrada por ${ATTRIBUTION_DAYS} dias após o clique no seu link.`,
	},
	{
		icon: ReceiptText,
		title: "Código tem prioridade",
		text: "Se o lojista informar seu código no cadastro, a indicação é sua mesmo sem o clique no link.",
	},
];

export function PartnersHowItWorks() {
	return (
		<section id="como-funciona-parceria" className="scroll-mt-[60px] pt-36 max-md:pt-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<SectionHeading eyebrow="01 · Como funciona" title="Três passos." muted="Uma receita que não para." />
				<ol className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-6 max-md:mt-10 max-md:gap-4">
					{STEPS.map((step, index) => (
						<li key={step.title} className="flex flex-col gap-3.5 rounded-3xl border border-[#0e1214]/8 bg-white p-7 max-md:p-6">
							<div className="flex items-center justify-between">
								<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
									<step.icon className="size-5" aria-hidden />
								</span>
								<span className="text-[13px] font-semibold text-[#8a979c]">{String(index + 1).padStart(2, "0")}</span>
							</div>
							<h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">{step.title}</h3>
							<p className="text-[15px] leading-[1.6] text-[#5b6a70]">{step.text}</p>
						</li>
					))}
				</ol>
				<div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-x-12 gap-y-6 rounded-3xl bg-[#eef2f6] p-7 max-md:mt-4 max-md:p-6">
					{ATTRIBUTION.map((item) => (
						<div key={item.title} className="flex gap-3.5">
							<span className="flex size-10 flex-none items-center justify-center rounded-full bg-white text-[#24549c]">
								<item.icon className="size-[18px]" aria-hidden />
							</span>
							<div>
								<p className="text-[15px] font-semibold">{item.title}</p>
								<p className="mt-1 text-[14px] leading-[1.55] text-[#5b6a70]">{item.text}</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

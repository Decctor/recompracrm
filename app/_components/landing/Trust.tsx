import { BadgeCheck, MessageCircle, ShieldCheck } from "lucide-react";
import { Container } from "./primitives";

const ITEMS = [
	{
		icon: BadgeCheck,
		title: "WhatsApp oficial",
		text: "Envio pela API oficial da Meta, com o número da própria loja. Nada de chip avulso nem número desconhecido.",
	},
	{ icon: ShieldCheck, title: "LGPD", text: "Os dados dos seus clientes são seus. Consentimento registrado e exclusão sob demanda." },
	{
		icon: MessageCircle,
		title: "Suporte humano",
		text: "Time comercial e de suporte no WhatsApp, em horário comercial. Pagamento seguro via Stripe.",
	},
];

export function LandingTrust() {
	return (
		<section id="confianca" className="border-t border-[#e3e8ea] bg-white py-20 sm:py-24">
			<Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-10">
				{ITEMS.map(({ icon: Icon, title, text }) => (
					<div key={title}>
						<Icon className="h-[22px] w-[22px] text-[#24549c]" aria-hidden />
						<p className="mt-3.5 text-[17px] font-semibold">{title}</p>
						<p className="mt-1.5 text-[15px] leading-[1.6] text-[#5b6a70]">{text}</p>
					</div>
				))}
			</Container>
		</section>
	);
}

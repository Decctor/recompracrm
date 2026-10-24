import { TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { ArrowRight } from "lucide-react";
import { PARTNER_CTA_EVENT, PARTNER_LOGIN_HREF } from "./program-facts";

export function PartnersClosingCTA() {
	return (
		<section className="px-6 pb-6 max-md:px-3 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-28 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<span className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-full bg-white/8 px-3.5 text-[13px] font-medium text-white/85">
					<span className="size-1.5 rounded-full bg-[#ffb900]" aria-hidden />
					Participar é gratuito
				</span>
				<h2 className="mt-7 text-balance text-[60px] font-semibold leading-[1.02] tracking-[-0.045em] max-md:text-[40px] max-[400px]:text-[34px]">
					Sua rede já existe.
					<br />
					<span className="text-[#ffb900]">Comece a ganhar com ela.</span>
				</h2>
				<p className="mt-6 max-w-[50ch] text-[18px] leading-[1.6] text-white/70 max-md:text-[16px]">
					Entre no programa, pegue seu link de indicação e acompanhe cada comissão pelo painel do parceiro.
				</p>
				<TrackedLink
					href={PARTNER_LOGIN_HREF}
					event={PARTNER_CTA_EVENT}
					controlEvent="lead"
					properties={{ cta_id: "closing_entrar_no_programa", location: "partner_closing" }}
					className="mt-9 inline-flex h-[52px] items-center gap-2 whitespace-nowrap rounded-full bg-[#ffb900] px-6 text-[15px] font-semibold text-[#171717] transition-colors hover:bg-[#e6a700]"
				>
					Entrar no programa
					<ArrowRight className="size-4 flex-none" aria-hidden />
				</TrackedLink>
			</div>
		</section>
	);
}

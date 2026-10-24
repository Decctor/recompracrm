import { ArrowRight } from "lucide-react";
import { TrackedCta } from "./TrackedCta";
import { ERP_WHATSAPP_URL } from "./erp-links";

export function ErpContact() {
	return (
		<section id="contato" className="bg-white px-6 pb-6 max-md:px-3 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-28 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<h2 className="max-w-[760px] text-balance text-[56px] font-semibold leading-[1.04] tracking-[-0.04em] max-md:text-[38px]">
					Vamos montar o ERP da sua loja.
				</h2>
				<p className="mt-5 max-w-[560px] text-[18px] leading-[1.6] text-white/66 max-md:text-[16px]">
					Proposta sob medida para a sua operação, com implantação acompanhada. O plano de CRM pode ser contratado junto ou separado.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={ERP_WHATSAPP_URL}
						ctaId="erp_contato_especialista"
						location="erp_contato"
						className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-[22px] text-[15px] font-medium text-[#0b1628] transition-colors hover:bg-[#eef2f6]"
					>
						Falar com especialista
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="/#planos"
						ctaId="erp_contato_planos_crm"
						location="erp_contato"
						className="inline-flex h-12 items-center rounded-full border border-white/20 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-white/8"
					>
						Ver planos do CRM
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

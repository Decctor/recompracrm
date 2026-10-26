import { ArrowRight } from "lucide-react";
import { ScaledMock } from "./ScaledMock";
import { TrackedCta } from "./TrackedCta";
import { ERP_WHATSAPP_URL } from "./erp-links";
import { PosScreenMock } from "./mocks/PosScreenMock";

export function ErpHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-[#e3e8ea] pr-3 pl-1.5 text-[13px] font-medium text-[#4b585d]">
					<span className="inline-flex h-5 items-center rounded-full bg-[#ffb900] px-2 text-[11px] font-bold tracking-[0.04em] text-[#171717]">NOVO</span>
					ERP RecompraCRM
				</span>
				<h1 className="mt-7 max-w-[880px] text-balance text-[68px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
					Venda, emita nota e fidelize no mesmo sistema.
				</h1>
				<p className="mt-6 max-w-[620px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
					PDV, fiscal, compras, estoque, financeiro, mesas e loja digital. A venda nasce no RecompraCRM, então o cashback é creditado e resgatado na
					própria frente de caixa.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={ERP_WHATSAPP_URL}
						ctaId="erp_hero_especialista"
						location="erp_hero"
						className="inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]"
					>
						Falar com especialista
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="#canais"
						ctaId="erp_hero_ver_por_dentro"
						location="erp_hero"
						className="inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
					>
						Ver por dentro
					</TrackedCta>
				</div>
			</div>

			<div className="mx-auto mt-[72px] max-w-[1400px] px-6 max-md:mt-14 max-md:px-4">
				<div className="overflow-hidden rounded-[28px] bg-[#eef2f6] px-12 pt-12 max-md:rounded-[20px] max-md:px-4 max-md:pt-4">
					<ScaledMock width={1280} label="Tela de nova venda do PDV com cliente vinculado e desconto em cashback no checkout">
						<PosScreenMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

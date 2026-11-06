import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScaledMock } from "../../_components/ScaledMock";
import { TrackedCta } from "../../_components/TrackedCta";
import { PosScreenMock } from "../../_components/mocks/PosScreenMock";
import { PDV_WHATSAPP_URL } from "./pdv-content";

export function PdvHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-[13px] font-medium text-[#687a80]">
					<Link href="/erp" className="transition-colors hover:text-[#0e1214]">
						ERP
					</Link>
					<ChevronRight className="size-3.5" aria-hidden />
					<span className="text-[#0e1214]">PDV</span>
				</nav>
				<h1 className="mt-7 max-w-[900px] text-balance text-[68px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
					Sistema PDV: a frente de caixa que já fideliza.
				</h1>
				<p className="mt-6 max-w-[640px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
					Bipe, pese, receba e emita a NFC-e em uma tela. Cada venda do caixa baixa o estoque, lança no financeiro e credita o cashback do cliente, sem
					digitar nada duas vezes.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={PDV_WHATSAPP_URL}
						ctaId="erp_pdv_hero_especialista"
						location="erp_pdv_hero"
						className="inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]"
					>
						Ver o PDV funcionando
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="#venda"
						ctaId="erp_pdv_hero_como_funciona"
						location="erp_pdv_hero"
						className="inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
					>
						Como funciona
					</TrackedCta>
				</div>
				<p className="mt-5 text-[13px] text-[#687a80]">Roda no navegador · Leitor de código de barras e balança · Maquininha Stone integrada</p>
			</div>

			<div className="mx-auto mt-[72px] max-w-[1400px] px-6 max-md:mt-14 max-md:px-4">
				<div className="overflow-hidden rounded-[28px] bg-[#eef2f6] px-12 pt-12 max-md:rounded-[20px] max-md:px-4 max-md:pt-4">
					<ScaledMock
						width={1280}
						label="Tela de nova venda do PDV: produtos com estoque, cliente vinculado pelo telefone e desconto em cashback no checkout"
					>
						<PosScreenMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

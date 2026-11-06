import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScaledMock } from "../../_components/ScaledMock";
import { TrackedCta } from "../../_components/TrackedCta";
import { ShopPhoneMock } from "../../_components/mocks/ShopPhoneMock";
import { MENU_WHATSAPP_URL } from "./menu-content";

export function MenuHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-14 px-6 max-md:px-4">
				<div className="max-w-[580px]">
					<nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-[13px] font-medium text-[#687a80]">
						<Link href="/erp" className="transition-colors hover:text-[#0e1214]">
							ERP
						</Link>
						<ChevronRight className="size-3.5" aria-hidden />
						<span className="text-[#0e1214]">Cardápio digital</span>
					</nav>
					<h1 className="mt-7 text-balance text-[64px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
						Cardápio digital com pedido, sem comissão.
					</h1>
					<p className="mt-6 text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
						Um link com a sua marca, onde o cliente monta o pedido para entrega ou retirada. O pedido cai no seu quadro, o cliente entra na sua base e o
						cashback funciona igual ao balcão.
					</p>
					<div className="mt-9 flex flex-wrap gap-2.5">
						<TrackedCta
							href={MENU_WHATSAPP_URL}
							ctaId="erp_menu_hero_especialista"
							location="erp_menu_hero"
							className="inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]"
						>
							Ver o cardápio funcionando
							<ArrowRight className="size-4 flex-none" aria-hidden />
						</TrackedCta>
						<TrackedCta
							href="#pedido"
							ctaId="erp_menu_hero_como_funciona"
							location="erp_menu_hero"
							className="inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
						>
							Como funciona
						</TrackedCta>
					</div>
					<p className="mt-5 text-[13px] text-[#687a80]">Sem aplicativo · Entrega e retirada · Sem taxa por pedido</p>
				</div>
				<div className="flex justify-center rounded-[28px] bg-[#eef2f6] px-10 pt-12 max-md:rounded-[20px] max-md:px-6 max-md:pt-8">
					<div className="w-full max-w-[380px] [mask-image:linear-gradient(to_bottom,#000_82%,transparent)]">
						<ScaledMock width={410} label="Cardápio digital da Gelateria Aurora aberto em um celular, com entrega, retirada e os mais pedidos">
							<ShopPhoneMock />
						</ScaledMock>
					</div>
				</div>
			</div>
		</section>
	);
}

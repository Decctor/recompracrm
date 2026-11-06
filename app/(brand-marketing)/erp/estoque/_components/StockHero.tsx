import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ScaledMock } from "../../_components/ScaledMock";
import { TrackedCta } from "../../_components/TrackedCta";
import { StockReportsMock } from "./mocks/StockReportsMock";
import { STOCK_WHATSAPP_URL } from "./stock-content";

export function StockHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<nav aria-label="Navegação estrutural" className="flex items-center gap-1.5 text-[13px] font-medium text-[#687a80]">
					<Link href="/erp" className="transition-colors hover:text-[#0e1214]">
						ERP
					</Link>
					<ChevronRight className="size-3.5" aria-hidden />
					<span className="text-[#0e1214]">Controle de estoque</span>
				</nav>
				<h1 className="mt-7 max-w-[900px] text-balance text-[68px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[44px] max-[420px]:text-[38px]">
					Controle de estoque que se atualiza a cada venda.
				</h1>
				<p className="mt-6 max-w-[660px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
					A venda baixa o saldo, a nota do fornecedor entra pelo XML e o lote que vence antes sai primeiro. Os relatórios mostram o que comprar, o que está
					parado e quanto dinheiro está na prateleira.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={STOCK_WHATSAPP_URL}
						ctaId="erp_stock_hero_especialista"
						location="erp_stock_hero"
						className="inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]"
					>
						Ver o estoque funcionando
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="#baixa"
						ctaId="erp_stock_hero_como_funciona"
						location="erp_stock_hero"
						className="inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]"
					>
						Como funciona
					</TrackedCta>
				</div>
				<p className="mt-5 text-[13px] text-[#687a80]">Baixa automática · Entrada por XML · Lotes e validade · Recontagem</p>
			</div>

			<div className="mx-auto mt-[72px] max-w-[1400px] px-6 max-md:mt-14 max-md:px-4">
				<div className="overflow-hidden rounded-[28px] bg-[#eef2f6] px-12 pt-12 max-md:rounded-[20px] max-md:px-4 max-md:pt-4">
					<ScaledMock
						width={1120}
						label="Relatórios de estoque: resumo com unidades em estoque, valor imobilizado, produtos zerados e lotes vencendo, e o ponto de pedido com a sugestão de compra"
					>
						<StockReportsMock />
					</ScaledMock>
				</div>
			</div>
		</section>
	);
}

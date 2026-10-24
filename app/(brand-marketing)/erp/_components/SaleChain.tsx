import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { SaleChainGrid } from "./SaleChainGrid";

const LIFECYCLE = ["Orçamento", "Condicional", "Confirmada", "Faturada"];

export function SaleChain() {
	return (
		<section id="cadeia" data-dock="dark" className="mt-36 bg-[#0b1628] py-32 text-white max-md:mt-24 max-md:py-24">
			<div className="mx-auto max-w-[1240px] px-6 max-md:px-4">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-x-16 gap-y-8">
					<div>
						<p className="mb-4 text-[13px] font-semibold text-[#ffb900]">02 · Depois de finalizar</p>
						<h2 className="text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]">
							Uma venda confirmada já sai com tudo lançado.
						</h2>
					</div>
					<p className="text-pretty text-[17px] leading-[1.6] text-white/66">
						Contabilidade, financeiro, nota fiscal, estoque e cashback são gerados a partir da mesma venda. Ninguém redigita nada em outro sistema.
					</p>
				</div>

				<SaleChainGrid />

				<div className="mt-5 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
					<div className="flex flex-wrap items-center gap-2">
						{LIFECYCLE.map((label, index) => (
							<span key={label} className="inline-flex items-center gap-2">
								<span
									className={cn(
										"inline-flex h-7 items-center rounded-full px-3 text-[13px] font-medium",
										index >= 2 ? "bg-white text-[#0b1628]" : "border border-white/20 text-white/80",
									)}
								>
									{label}
								</span>
								{index < LIFECYCLE.length - 1 ? <ArrowRight className="size-3.5 flex-none text-white/35" aria-hidden /> : null}
							</span>
						))}
					</div>
					<p className="max-w-[560px] text-[14px] leading-[1.55] text-white/55">
						Orçamento e condicional não mexem no estoque nem no caixa. No cancelamento, o sistema estorna, devolve os itens e vincula a nota de cancelamento
						à original.
					</p>
				</div>
			</div>
		</section>
	);
}

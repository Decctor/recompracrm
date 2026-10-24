import type { IntegrationPage } from "@/app/_content/integration-pages";
import { BrandLogo } from "@/components/Brand/BrandLogo";
import { Plug } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

// Topo do hub: chamada centralizada e a faixa "conectores → RecompraCRM". A linha tracejada é
// horizontal a partir de `sm` e vertical no celular, onde os logos quebram em linhas.
export function IntegrationsHubHero({ integrations }: { integrations: IntegrationPage[] }) {
	return (
		<header id="top" className="pt-[120px] sm:pt-[168px]">
			<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
				<span className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-full border border-[#e3e8ea] px-3 text-[13px] font-medium leading-[normal] text-[#4b585d]">
					<Plug className="size-3.5 text-[#24549c]" aria-hidden />
					Integrações
				</span>
				<h1 className="m-0 mt-7 max-w-[820px] text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] text-balance sm:text-[52px] lg:text-[64px] lg:leading-[1.02]">
					Seus dados de venda, <span className="text-[#24549c]">sem digitar duas vezes</span>
				</h1>
				<p className="m-0 mt-6 max-w-[640px] text-[17px] leading-[1.6] text-[#5b6a70] text-pretty sm:text-[19px]">
					Conecte o sistema que sua loja já usa. O RecompraCRM importa vendas, clientes e produtos automaticamente e coloca cashback, análise RFM e
					campanhas de WhatsApp para rodar sozinhos.
				</p>
			</div>

			<div className="mx-auto mt-12 max-w-[1240px] px-6 sm:mt-16">
				<div className="flex flex-col items-center justify-center gap-5 rounded-[28px] bg-[#eef2f6] px-5 py-10 sm:flex-row sm:flex-wrap sm:px-8 sm:py-14">
					<ul className="m-0 flex list-none flex-wrap justify-center gap-3 p-0">
						{integrations.map((integration) => (
							<li key={integration.slug}>
								<Link
									href={`/integrations/${integration.slug}`}
									title={integration.name}
									className="flex size-14 items-center justify-center rounded-full bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_12px_28px_-16px_rgba(16,24,40,0.35)] transition-transform duration-300 hover:-translate-y-[3px] sm:size-[72px] sm:p-3.5"
								>
									<Image src={integration.logo} alt={integration.name} className="size-full object-contain" sizes="72px" />
								</Link>
							</li>
						))}
					</ul>
					<span
						aria-hidden
						className="block h-10 w-0.5 bg-[repeating-linear-gradient(180deg,#9db6dd_0_6px,transparent_6px_12px)] sm:h-0.5 sm:w-24 sm:bg-[repeating-linear-gradient(90deg,#9db6dd_0_6px,transparent_6px_12px)]"
					/>
					<span className="flex h-16 items-center gap-3 whitespace-nowrap rounded-full bg-[#0b1628] pr-6 pl-3 text-base font-semibold leading-[normal] text-white sm:h-[72px] sm:pl-3.5">
						<span className="relative size-10 sm:size-11">
							<BrandLogo lockup="icon-badge" tone="color" alt="" fill className="object-contain" />
						</span>
						RecompraCRM
					</span>
				</div>
			</div>
		</header>
	);
}

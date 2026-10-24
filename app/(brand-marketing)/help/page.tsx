import { HELP_ARTICLES } from "@/app/_content/help-articles";
import { HelpCenterSearch } from "@/components/Help/HelpCenterSearch";
import { SupportLink } from "@/components/Help/SupportLink";
import { ArrowRight, BookOpenCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Central de Ajuda",
	description: "Tutoriais práticos para configurar integrações e usar melhor o RecompraCRM.",
	alternates: { canonical: "https://www.recompracrm.com.br/help" },
	openGraph: {
		title: "Central de Ajuda RecompraCRM",
		description: "Tutoriais práticos para configurar integrações e usar melhor o RecompraCRM.",
		url: "https://www.recompracrm.com.br/help",
		type: "website",
	},
};

export default function HelpCenterPage() {
	return (
		<main>
			<HelpCenterSearch
				articles={HELP_ARTICLES}
				intro={
					<>
						<span className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-full border border-[#e3e8ea] px-3 text-[13px] font-medium leading-[normal] text-[#4b585d]">
							<BookOpenCheck className="size-3.5 text-[#24549c]" aria-hidden />
							Central de ajuda
						</span>
						<h1 className="m-0 mt-7 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-balance sm:text-[60px] lg:text-[72px] lg:leading-none">
							Como podemos ajudar?
						</h1>
						<p className="m-0 mt-6 max-w-[600px] text-[17px] leading-[1.6] text-[#5b6a70] text-pretty sm:text-[19px]">
							Tutoriais diretos para configurar integrações e aproveitar melhor o RecompraCRM no dia a dia.
						</p>
					</>
				}
			/>

			<section className="pt-20 pb-24 sm:pt-24 sm:pb-[120px]">
				<div className="mx-auto max-w-[1240px] px-6">
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-x-16 gap-y-6 rounded-[28px] bg-[#eef2f6] px-6 py-10 sm:px-12 sm:py-14">
						<div>
							<p className="m-0 flex items-center gap-2 text-[13px] font-semibold leading-[normal] text-[#24549c]">
								<Sparkles className="size-4" aria-hidden />
								Em breve
							</p>
							<h2 className="m-0 mt-3 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[32px]">Mais tutoriais estão a caminho</h2>
						</div>
						<div>
							<p className="m-0 text-[17px] leading-[1.6] text-[#5b6a70]">
								Estamos preparando guias sobre integrações, campanhas, WhatsApp e as rotinas mais importantes da sua operação.
							</p>
							<SupportLink
								location="help_coming_soon"
								className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium leading-[normal] text-[#0e1214] hover:text-[#24549c]"
							>
								Precisa de ajuda agora? Fale com o suporte
								<ArrowRight className="size-4" aria-hidden />
							</SupportLink>
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}

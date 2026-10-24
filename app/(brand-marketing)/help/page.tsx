import { HELP_ARTICLES } from "@/app/_content/help-articles";
import { HelpCenterSearch } from "@/components/Help/HelpCenterSearch";
import { BookOpenCheck, Sparkles } from "lucide-react";
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
		<main className="overflow-hidden pt-24 pb-20">
			<section className="relative border-b border-slate-100 px-6 pt-14 pb-16">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(36,84,156,0.13),transparent_52%)]" />
				<div className="mx-auto max-w-5xl text-center">
					<span className="inline-flex items-center gap-2 rounded-full bg-[#24549C]/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#24549C]">
						<BookOpenCheck className="size-4" /> Central de ajuda
					</span>
					<h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-[-0.025em] text-slate-950 sm:text-5xl lg:text-6xl">
						Como podemos ajudar?
					</h1>
					<p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
						Tutoriais diretos para configurar integrações e aproveitar melhor o RecompraCRM no dia a dia.
					</p>
					<div className="mt-9">
						<HelpCenterSearch articles={HELP_ARTICLES} />
					</div>
				</div>
			</section>

			<section className="px-6 py-16">
				<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-[#FFB900]/20 text-[#1a3d7a]">
						<Sparkles className="size-5" />
					</div>
					<p className="mt-5 text-xs font-extrabold uppercase tracking-[0.08em] text-[#24549C]">Em breve</p>
					<h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Mais tutoriais estão a caminho</h2>
					<p className="mt-3 max-w-xl leading-relaxed text-slate-600">
						Estamos preparando guias sobre integrações, campanhas, WhatsApp e as rotinas mais importantes da sua operação.
					</p>
				</div>
			</section>
		</main>
	);
}

import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TrackedCta } from "./TrackedCta";

// Seções comuns às ferramentas gratuitas: abertura, cartões de "continue" e o CTA final.

export function ToolHero({ icon: Icon, title, lead, note }: { icon: LucideIcon; title: string; lead: string; note?: string }) {
	return (
		<header id="top" className="pt-40 max-md:pt-[112px]">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-end gap-x-[72px] gap-y-6 px-6">
				<div>
					<span className="inline-flex h-[30px] items-center gap-2 rounded-full border border-[#e3e8ea] px-3 text-[13px] font-medium whitespace-nowrap text-[#4b585d]">
						<Icon className="h-3.5 w-3.5 flex-none text-[#24549c]" aria-hidden />
						Ferramenta gratuita
					</span>
					<h1 className="mt-7 text-[64px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance max-md:text-[40px]">{title}</h1>
				</div>
				<div className="max-w-[520px]">
					<p className="text-[19px] leading-[1.6] text-pretty text-[#5b6a70] max-md:text-[17px]">{lead}</p>
					{note ? <p className="mt-4 text-[13px] text-[#8a979c]">{note}</p> : null}
				</div>
			</div>
		</header>
	);
}

export function ToolSectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
	return (
		<div>
			{eyebrow ? <p className="mb-4 text-[13px] font-semibold text-[#24549c]">{eyebrow}</p> : null}
			<h2 className="text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance max-md:text-[32px]">{title}</h2>
			{children ? <p className="mt-4 text-[16px] leading-[1.6] text-[#5b6a70]">{children}</p> : null}
		</div>
	);
}

export type TContinueCard = { eyebrow: string; title: string; action: string; href: string };

export function ContinueCards({ cards }: { cards: TContinueCard[] }) {
	return (
		<section aria-label="Continue" className="pt-[120px] max-md:pt-20">
			<div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-6 px-6">
				{cards.map((card) => (
					<Link
						key={card.href}
						href={card.href}
						className="group flex min-h-[220px] flex-col gap-3.5 rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-7 text-[#0e1214] transition-[box-shadow,transform] duration-[350ms] hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] max-md:min-h-[180px] max-md:p-6"
					>
						<span className="text-[13px] font-semibold text-[#24549c]">{card.eyebrow}</span>
						<span className="text-[22px] leading-[1.25] font-semibold tracking-[-0.02em]">{card.title}</span>
						<span className="mt-auto flex items-center justify-between gap-3 border-t border-[#eef1f2] pt-4 text-[14px] font-medium text-[#5b6a70]">
							{card.action}
							<ArrowUpRight className="h-[18px] w-[18px] flex-none text-[#8a979c]" aria-hidden />
						</span>
					</Link>
				))}
			</div>
		</section>
	);
}

type ToolCtaProps = { title: string; text: string; demoLabel: string; whatsappText: string; location: string };

export function ToolCta({ title, text, demoLabel, whatsappText, location }: ToolCtaProps) {
	return (
		<section id="cta" className="scroll-mt-[60px] px-6 pt-[120px] pb-6 max-md:px-3 max-md:pt-24 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-24 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<h2 className="max-w-[760px] text-[52px] leading-[1.04] font-semibold tracking-[-0.04em] text-balance max-md:text-[34px]">{title}</h2>
				<p className="mt-5 max-w-[580px] text-[18px] leading-[1.6] text-white/70 max-md:text-[16px]">{text}</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={`https://wa.me/553492465388?text=${encodeURIComponent(whatsappText)}`}
						ctaId={`${location}_demo`}
						location={location}
						className="inline-flex h-[52px] items-center gap-2 rounded-full bg-[#ffb900] px-6 text-[15px] font-semibold whitespace-nowrap text-[#171717] transition-colors hover:bg-[#ffc933]"
					>
						{demoLabel}
						<ArrowRight className="h-4 w-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href="/auth/signup"
						ctaId={`${location}_trial`}
						location={location}
						className="inline-flex h-[52px] items-center rounded-full border border-white/20 px-6 text-[15px] font-medium whitespace-nowrap text-white transition-colors hover:bg-white/8"
					>
						Testar 15 dias grátis
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

/** Dados estruturados de uma ferramenta: aplicação web gratuita + trilha. */
export function ToolJsonLd({ name, description, path }: { name: string; description: string; path: string }) {
	const url = `https://www.recompracrm.com.br${path}`;
	const data = [
		{
			"@context": "https://schema.org",
			"@type": "WebApplication",
			name,
			description,
			url,
			applicationCategory: "BusinessApplication",
			operatingSystem: "Web",
			inLanguage: "pt-BR",
			isAccessibleForFree: true,
			offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
			publisher: { "@type": "Organization", name: "RecompraCRM", url: "https://www.recompracrm.com.br" },
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "Início", item: "https://www.recompracrm.com.br" },
				// `/tools` ainda é só um redirecionamento, então a trilha não passa por ele.
				{ "@type": "ListItem", position: 2, name, item: url },
			],
		},
	];
	return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

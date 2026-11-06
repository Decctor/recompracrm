import { Dock } from "@/app/_components/Dock";
import { MarketingFooter } from "@/app/_components/MarketingFooter";
import {
	CONSULTORIA_INCLUDED,
	PLATFORM_INCLUDED,
	PLATFORM_YEARLY_MONTHLY_EQUIVALENT,
	PLATFORM_YEARLY_SAVINGS_PERCENT,
	PRICING,
	PRICING_GUARANTEES,
	formatPlanPrice,
} from "@/app/_content/pricing";
import { buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { ArrowRight, Check, Minus, Plus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TrackedCta } from "../features/_components/TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "../features/_components/feature-links";
import { PricingPlans } from "./_components/PricingPlans";
import { PRICING_ADDONS, PRICING_COMPARISON, PRICING_FAQS, PRICING_PATH, PRICING_SLUG, PRICING_WHATSAPP_TEXT } from "./_components/pricing-content";

const BASE_URL = "https://www.recompracrm.com.br";
const monthly = formatPlanPrice(PRICING.platformMonthly);
const title = `Preços do RecompraCRM: planos a partir de R$ ${monthly} por mês`;
const description = `Quanto custa o RecompraCRM: Plataforma por R$ ${monthly}/mês ou plano anual com ${PLATFORM_YEARLY_SAVINGS_PERCENT}% de desconto, e Plataforma + Gestor de Crescimento por R$ ${formatPlanPrice(PRICING.bundleMonthly)}/mês. ${PRICING.trialDays} dias grátis, sem cartão e sem taxa de setup.`;

export const metadata: Metadata = {
	title,
	description,
	keywords: ["recompracrm preço", "crm preço", "quanto custa um crm", "crm barato", "preço programa de fidelidade", "crm para varejo preço"],
	alternates: { canonical: PRICING_PATH },
	openGraph: { title: `${title} | RecompraCRM`, description, url: `${BASE_URL}${PRICING_PATH}`, type: "website" },
	twitter: { card: "summary_large_image", title: `${title} | RecompraCRM`, description },
};

const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.035em] max-md:text-[34px]";

const productJsonLd = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "RecompraCRM",
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web",
	url: BASE_URL,
	offers: [
		{
			"@type": "Offer",
			name: "Plataforma (mensal)",
			price: PRICING.platformMonthly.toFixed(2),
			priceCurrency: "BRL",
			priceSpecification: { "@type": "UnitPriceSpecification", price: PRICING.platformMonthly.toFixed(2), priceCurrency: "BRL", billingDuration: "P1M" },
			url: `${BASE_URL}${PRICING_PATH}`,
		},
		{
			"@type": "Offer",
			name: "Plataforma (anual)",
			price: PRICING.platformYearly.toFixed(2),
			priceCurrency: "BRL",
			priceSpecification: { "@type": "UnitPriceSpecification", price: PRICING.platformYearly.toFixed(2), priceCurrency: "BRL", billingDuration: "P1Y" },
			url: `${BASE_URL}${PRICING_PATH}`,
		},
		{
			"@type": "Offer",
			name: "Plataforma + Gestor de Crescimento (mensal)",
			price: PRICING.bundleMonthly.toFixed(2),
			priceCurrency: "BRL",
			priceSpecification: { "@type": "UnitPriceSpecification", price: PRICING.bundleMonthly.toFixed(2), priceCurrency: "BRL", billingDuration: "P1M" },
			url: `${BASE_URL}${PRICING_PATH}`,
		},
	],
};

const breadcrumbJsonLd = {
	"@context": "https://schema.org",
	"@type": "BreadcrumbList",
	itemListElement: [
		{ "@type": "ListItem", position: 1, name: "RecompraCRM", item: BASE_URL },
		{ "@type": "ListItem", position: 2, name: "Preços", item: `${BASE_URL}${PRICING_PATH}` },
	],
};

function ComparisonCell({ value }: { value: boolean | string }) {
	if (value === true) return <Check className="mx-auto size-4 text-[#24549c]" aria-label="Incluso" />;
	if (value === false) return <Minus className="mx-auto size-4 text-[#c2cbcf]" aria-label="Não incluso" />;
	return <span className="text-[14px] font-medium text-[#2b3538]">{value}</span>;
}

export default function PricingPage() {
	return (
		<div className="min-h-screen bg-white font-outfit text-[#0e1214] leading-[normal] antialiased lining-nums tabular-nums">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbJsonLd, productJsonLd, buildFAQPageJsonLd(PRICING_FAQS)]) }}
			/>
			<Dock variant="pricing" />
			<main>
				<section id="top" className="bg-white pt-[168px] max-md:pt-32">
					<div className="mx-auto flex max-w-[860px] flex-col items-center px-6 text-center">
						<p className={EYEBROW}>Preços</p>
						<h1 className="text-balance text-[64px] font-semibold leading-[1.02] tracking-[-0.04em] max-md:text-[42px]">
							Um preço por mês. A mesma plataforma nos dois planos.
						</h1>
						<p className="mt-6 max-w-[600px] text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
							Sem cobrança por cliente cadastrado ou por campanha. A diferença entre os planos é quem opera: você ou a equipe do RecompraCRM.
						</p>
					</div>
				</section>

				<section id="planos" className="scroll-mt-[80px] bg-white pt-14">
					<div className="mx-auto max-w-[1040px] px-6 max-md:px-4">
						<PricingPlans
							platformMonthly={monthly}
							platformYearly={formatPlanPrice(PRICING.platformYearly)}
							platformYearlyEquivalent={formatPlanPrice(PLATFORM_YEARLY_MONTHLY_EQUIVALENT)}
							yearlySavings={PLATFORM_YEARLY_SAVINGS_PERCENT}
							bundleMonthly={formatPlanPrice(PRICING.bundleMonthly)}
							trialDays={PRICING.trialDays}
							platformIncluded={PLATFORM_INCLUDED}
							consultoriaIncluded={CONSULTORIA_INCLUDED}
						/>
						<ul className="mt-8 flex list-none flex-wrap justify-center gap-x-6 gap-y-2 p-0 text-[13px] text-[#687a80]">
							{PRICING_GUARANTEES.map((item) => (
								<li key={item} className="flex items-center gap-1.5">
									<ShieldCheck className="size-3.5 text-[#24549c]" aria-hidden />
									{item}
								</li>
							))}
						</ul>
					</div>
				</section>

				<section id="adicionais" className="scroll-mt-[80px] bg-white pt-32 max-md:pt-24">
					<div className={CONTAINER}>
						<div className="max-w-[640px]">
							<p className={EYEBROW}>Adicionais</p>
							<h2 className={H2}>Para quem precisa de mais do que fidelização.</h2>
							<p className="mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]">
								Estes módulos não entram no plano-base. Um especialista monta a proposta com a sua operação.
							</p>
						</div>
						<ul className="mt-12 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4 p-0">
							{PRICING_ADDONS.map((addon) => (
								<li key={addon.key} className="flex flex-col rounded-2xl border border-[#e3e8ea] p-8 max-md:p-6">
									<div className="flex flex-wrap items-baseline justify-between gap-3">
										<h3 className="text-[21px] font-semibold tracking-[-0.02em]">{addon.title}</h3>
										<span className="text-[14px] font-semibold text-[#24549c]">{addon.price}</span>
									</div>
									<p className="mt-3 flex-1 text-[15px] leading-[1.6] text-[#5b6a70]">{addon.text}</p>
									<div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-medium">
										<Link href={addon.href} className="inline-flex items-center gap-1.5 text-[#0e1214] hover:text-[#24549c]">
											{addon.linkLabel}
											<ArrowRight className="size-4" aria-hidden />
										</Link>
										<TrackedCta
											href={whatsappHref(`Olá! Quero uma proposta do ${addon.title} do RecompraCRM.`)}
											ctaId={`pricing_addon_${addon.key}`}
											location="pricing_addons"
											slug={PRICING_SLUG}
											className="inline-flex items-center gap-1.5 text-[#24549c] hover:underline"
										>
											Pedir proposta
										</TrackedCta>
									</div>
								</li>
							))}
						</ul>
					</div>
				</section>

				<section id="comparativo" className="bg-white pt-32 max-md:pt-24">
					<div className="mx-auto max-w-[1040px] px-6 max-md:px-4">
						<div className="max-w-[640px]">
							<p className={EYEBROW}>Comparativo</p>
							<h2 className={H2}>O que cada plano inclui.</h2>
						</div>
						<div className="mt-10 overflow-hidden rounded-[20px] border border-[#e3e8ea]">
							<div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] bg-[#f7f9f9] text-[13px] font-semibold text-[#4b585d]">
								<span className="px-6 py-4 max-md:px-4" />
								<span className="px-4 py-4 text-center">Plataforma</span>
								<span className="px-4 py-4 text-center text-[#24549c]">+ Gestor</span>
							</div>
							{PRICING_COMPARISON.map((row) => (
								<div key={row.feature} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-t border-[#e3e8ea]">
									<span className="px-6 py-4 text-[15px] max-md:px-4 max-md:text-[14px]">{row.feature}</span>
									<span className="px-4 py-4 text-center">
										<ComparisonCell value={row.platform} />
									</span>
									<span className="px-4 py-4 text-center">
										<ComparisonCell value={row.bundle} />
									</span>
								</div>
							))}
						</div>
						<p className="mt-4 text-[14px] text-[#687a80]">
							As mensagens do WhatsApp são cobradas pela Meta na conta da loja.{" "}
							<Link href="/tools/whatsapp-cost" className="font-medium text-[#24549c] hover:underline">
								Estime o custo do WhatsApp
							</Link>
							.
						</p>
					</div>
				</section>

				<section id="perguntas-frequentes" className="scroll-mt-[80px] bg-white py-32 max-md:py-24">
					<div className={`${CONTAINER} grid gap-x-[72px] gap-y-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]`}>
						<div>
							<p className={EYEBROW}>Dúvidas</p>
							<h2 className={H2}>Perguntas sobre preço.</h2>
						</div>
						<div className="flex flex-col border-t border-[#e3e8ea]">
							{PRICING_FAQS.map((faq, index) => (
								<details key={faq.question} open={index === 0} className="group border-b border-[#e3e8ea]">
									<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
										{faq.question}
										<Plus className="size-5 flex-none text-[#687a80] transition-transform group-open:rotate-45" aria-hidden />
									</summary>
									<p className="max-w-[680px] pb-6 text-[16px] leading-[1.65] text-[#5b6a70]">{faq.answer}</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section id="cta" className="bg-white px-6 pb-6 max-md:px-3 max-md:pb-3">
					<div
						data-dock="dark"
						className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-24 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-16"
					>
						<h2 className="max-w-[720px] text-balance text-[52px] font-semibold leading-[1.04] tracking-[-0.04em] max-md:text-[36px]">
							Teste {PRICING.trialDays} dias antes de pagar qualquer coisa.
						</h2>
						<p className="mt-5 max-w-[540px] text-[18px] leading-[1.6] text-white/66 max-md:text-[16px]">
							Sem cartão de crédito e sem taxa de setup. Se não fizer sentido, é só não continuar.
						</p>
						<div className="mt-9 flex flex-wrap justify-center gap-2.5">
							<TrackedCta
								href={SIGNUP_HREF}
								ctaId="pricing_cta_trial"
								location="pricing_cta"
								slug={PRICING_SLUG}
								className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-[22px] text-[15px] font-medium text-[#0b1628] transition-colors hover:bg-[#eef2f6]"
							>
								Testar {PRICING.trialDays} dias grátis
								<ArrowRight className="size-4 flex-none" aria-hidden />
							</TrackedCta>
							<TrackedCta
								href={whatsappHref(PRICING_WHATSAPP_TEXT)}
								ctaId="pricing_cta_especialista"
								location="pricing_cta"
								slug={PRICING_SLUG}
								className="inline-flex h-12 items-center rounded-full border border-white/20 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-white/8"
							>
								Falar com um especialista
							</TrackedCta>
						</div>
					</div>
				</section>
			</main>
			<MarketingFooter />
		</div>
	);
}

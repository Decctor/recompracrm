import { LANDING_CASES } from "@/app/_content/cases";
import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { caseHref, caseMetricText } from "../../../cases/_components/case-format";
import { FeatureStage } from "../../../features/_components/FeatureStage";
import { TrackedCta } from "../../../features/_components/TrackedCta";
import { SIGNUP_HREF, whatsappHref } from "../../../features/_components/feature-links";
import { CashbackProgramMock } from "../../../features/_components/mocks/cashback-mocks";
import { PdiProfileMock, PrizesMock } from "../../../features/_components/mocks/pdi-mocks";
import { WhatsappPreviewMock } from "../../../features/_components/mocks/whatsapp-mocks";
import { SegmentCard } from "../../../segments/_components/SegmentCard";
import {
	LOYALTY_DEFINITION,
	LOYALTY_DIGITAL_CARD_BULLETS,
	LOYALTY_FAQS,
	LOYALTY_MODELS,
	LOYALTY_SLUG,
	LOYALTY_STEPS,
	LOYALTY_WHATSAPP_TEXT,
} from "./loyalty-content";

// Mesma tipografia e palcos das páginas de funcionalidade, para o conteúdo parecer uma peça só.
const CONTAINER = "mx-auto max-w-[1240px] px-6 max-md:px-4";
const EYEBROW = "mb-4 text-[13px] font-semibold text-[#24549c]";
const H2 = "text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px]";
const LEAD = "mt-5 text-pretty text-[17px] leading-[1.6] text-[#5b6a70]";
const SPLIT = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-center gap-x-[72px] gap-y-12";
const PRIMARY_CTA =
	"inline-flex h-11 items-center gap-2 rounded-full bg-[#24549c] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#1f4886]";
const SECONDARY_CTA =
	"inline-flex h-11 items-center rounded-full border border-[#e3e8ea] px-5 text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f7f9f9]";

const FEATURED_SEGMENTS = ["restaurantes", "loja-de-roupas", "pet-shop", "supermercado-e-mercearia", "sorveteria", "farmacia-e-drogaria"];

export function LoyaltyHero() {
	return (
		<section id="top" className="bg-white pt-[168px] max-md:pt-32">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className="max-w-[560px]">
					<p className={EYEBROW}>Programa de fidelidade</p>
					<h1 className="text-balance text-[60px] font-semibold leading-[1.03] tracking-[-0.04em] max-md:text-[42px]">
						Programa de fidelidade para loja, sem cartão e sem aplicativo.
					</h1>
					<p className="mt-6 text-pretty text-[19px] leading-[1.55] text-[#5b6a70] max-md:text-[17px]">
						Cashback com validade, identificado pelo telefone no balcão e lembrado no WhatsApp. O cliente entende o valor na hora e volta antes que o
						crédito expire.
					</p>
					<div className="mt-9 flex flex-wrap gap-2.5">
						<TrackedCta href={SIGNUP_HREF} ctaId="loyalty_hero_trial" location="loyalty_hero" slug={LOYALTY_SLUG} className={PRIMARY_CTA}>
							Testar 15 dias grátis
							<ArrowRight className="size-4 flex-none" aria-hidden />
						</TrackedCta>
						<TrackedCta
							href={whatsappHref(LOYALTY_WHATSAPP_TEXT)}
							ctaId="loyalty_hero_especialista"
							location="loyalty_hero"
							slug={LOYALTY_SLUG}
							className={SECONDARY_CTA}
						>
							Montar com um especialista
						</TrackedCta>
					</div>
					<p className="mt-5 text-[13px] text-[#687a80]">Sem cartão de crédito · Configuração sugerida por segmento · Setup em menos de um dia</p>
				</div>
				<FeatureStage
					screen={{
						label: "Programa de cashback ativo, com cashback gerado, resgatado, taxa de resgate e cashback expirando",
						node: <CashbackProgramMock />,
					}}
				/>
			</div>
		</section>
	);
}

export function LoyaltyDefinition() {
	const stats = FEATURE_PAGES.find((page) => page.slug === "programa-de-cashback")?.sections.find((section) => section.type === "stats")?.items ?? [];
	return (
		<section id="conteudo" className="scroll-mt-[80px] bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="grid gap-x-[72px] gap-y-6 border-t border-[#0e1214] pt-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
					<h2 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.035em] max-md:text-[32px]">O que é um programa de fidelidade</h2>
					<p className="text-pretty text-[21px] leading-[1.6] text-[#2b3538] max-md:text-[18px]">{LOYALTY_DEFINITION}</p>
				</div>
				{stats.length > 0 ? (
					<div
						data-dock="dark"
						className="mt-16 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-10 gap-y-10 rounded-[28px] bg-[#0b1628] px-14 py-14 text-white max-md:rounded-[20px] max-md:px-6 max-md:py-10"
					>
						{stats.map((stat) => (
							<div key={stat.label} className="flex flex-col gap-3 border-t border-white/15 pt-5">
								<span className="text-[52px] font-semibold leading-none tracking-[-0.04em] max-md:text-[42px]">{stat.value}</span>
								<span className="text-[15px] leading-[1.5] text-white/72">{stat.label}</span>
								{stat.source ? <span className="text-[12px] font-semibold text-white/45">Fonte: {stat.source}</span> : null}
							</div>
						))}
					</div>
				) : null}
			</div>
		</section>
	);
}

export function LoyaltyModels() {
	return (
		<section id="modelos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>01 · Tipos de programa</p>
					<h2 className={H2}>Carimbo, pontos, cashback ou clube?</h2>
					<p className={LEAD}>Os quatro formatos mais comuns no varejo, pelo que o cliente sente e pelo que a loja ganha.</p>
				</div>
				<ul className="mt-14 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-4 p-0">
					{LOYALTY_MODELS.map((model) => (
						<li
							key={model.name}
							className={cn(
								"flex flex-col gap-4 rounded-[20px] border p-6",
								model.highlight ? "border-[#24549c] bg-[#f5f8fc] shadow-[0_20px_48px_-32px_rgba(36,84,156,0.6)]" : "border-[#e3e8ea]",
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<h3 className="text-[20px] font-semibold tracking-[-0.02em]">{model.name}</h3>
								{model.highlight ? (
									<span className="inline-flex h-6 items-center rounded-full bg-[#24549c] px-2.5 text-[11px] font-bold text-white">MELHOR NO BALCÃO</span>
								) : null}
							</div>
							<p className="text-[15px] leading-[1.55] text-[#2b3538]">{model.how}</p>
							<dl className="mt-auto flex flex-col gap-3 border-t border-[#e3e8ea] pt-4 text-[14px] leading-[1.5]">
								<div>
									<dt className="text-[12px] font-semibold text-[#687a80]">Para o cliente</dt>
									<dd className="mt-0.5 text-[#2b3538]">{model.customer}</dd>
								</div>
								<div>
									<dt className="text-[12px] font-semibold text-[#687a80]">Para a loja</dt>
									<dd className="mt-0.5 text-[#2b3538]">{model.store}</dd>
								</div>
							</dl>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

export function LoyaltySteps() {
	return (
		<section id="como-criar" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="max-w-[680px]">
					<p className={EYEBROW}>02 · Como criar</p>
					<h2 className={H2}>Monte o programa da sua loja em cinco decisões.</h2>
				</div>
				<ol className="mt-14 flex list-none flex-col border-t border-[#e3e8ea] p-0">
					{LOYALTY_STEPS.map((step, index) => (
						<li
							key={step.title}
							className="grid gap-x-10 gap-y-3 border-b border-[#e3e8ea] py-8 md:grid-cols-[56px_minmax(0,360px)_minmax(0,1fr)] md:items-start"
						>
							<span className="text-[14px] font-semibold text-[#8a979c]">{String(index + 1).padStart(2, "0")}</span>
							<h3 className="text-[22px] font-semibold leading-[1.25] tracking-[-0.02em]">{step.title}</h3>
							<div className="flex flex-col gap-3">
								<p className="text-[16px] leading-[1.6] text-[#5b6a70]">{step.text}</p>
								{step.link ? (
									<Link href={step.link.href} className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c] hover:underline">
										{step.link.label}
										<ArrowRight className="size-4 flex-none" aria-hidden />
									</Link>
								) : null}
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

export function LoyaltyDigitalCard() {
	return (
		<section id="cartao-digital" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<div className="max-w-[460px]">
					<p className={EYEBROW}>03 · Cartão fidelidade digital</p>
					<h2 className={H2}>O cartão de papel, sem papel.</h2>
					<p className={LEAD}>
						O telefone do cliente substitui o cartão: o saldo fica no sistema, não se perde na carteira, e a loja sabe quem voltou e quem sumiu.
					</p>
					<ul className="mt-7 flex list-none flex-col gap-3 p-0">
						{LOYALTY_DIGITAL_CARD_BULLETS.map((item) => (
							<li key={item} className="flex gap-3 text-[15px] leading-[1.5] text-[#2b3538]">
								<Check className="mt-[3px] size-4 flex-none text-[#24549c]" aria-hidden />
								{item}
							</li>
						))}
					</ul>
				</div>
				<div className="grid gap-4">
					<FeatureStage screen={{ label: "Perfil do cliente no Ponto de Interação, com o saldo de cashback e o histórico", node: <PdiProfileMock /> }} />
					<FeatureStage screen={{ label: "Aviso de saldo de cashback enviado ao cliente no WhatsApp", node: <WhatsappPreviewMock variant="utility" /> }} />
				</div>
			</div>
		</section>
	);
}

export function LoyaltyRewards() {
	return (
		<section id="recompensas" className="bg-white pt-36 max-md:pt-24">
			<div className={`${CONTAINER} ${SPLIT}`}>
				<FeatureStage className="max-[959px]:order-last" screen={{ label: "Escolha de recompensas no Ponto de Interação", node: <PrizesMock /> }} />
				<div className="max-w-[460px]">
					<p className={EYEBROW}>04 · Reais, pontos ou prêmios</p>
					<h2 className={H2}>O mesmo programa, do jeito que o seu cliente entende.</h2>
					<p className={LEAD}>
						O saldo pode aparecer em reais ou em pontos. Além do desconto na compra, o cliente pode trocar o saldo por recompensas do seu catálogo, como um
						produto da casa.
					</p>
					<Link
						href="/features/programa-de-cashback"
						className="mt-7 inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c] hover:underline"
					>
						Ver o programa de cashback por dentro
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</Link>
				</div>
			</div>
		</section>
	);
}

export function LoyaltySegments() {
	const segments = FEATURED_SEGMENTS.map((slug) => SEGMENT_PAGES.find((page) => page.slug === slug)).filter((page) => page !== undefined);
	return (
		<section id="segmentos" className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<div className="flex flex-wrap items-end justify-between gap-6">
					<div className="max-w-[680px]">
						<p className={EYEBROW}>05 · Por segmento</p>
						<h2 className={H2}>Cada tipo de loja começa com uma regra pronta.</h2>
					</div>
					<Link href="/segments" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0e1214] hover:text-[#24549c]">
						Todos os segmentos
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</Link>
				</div>
				<div className="mt-12 grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3">
					{segments.map((segment) => (
						<SegmentCard key={segment.slug} segment={segment} />
					))}
				</div>
			</div>
		</section>
	);
}

export function LoyaltyProof() {
	const featured = LANDING_CASES.find((item) => item.metrics.length > 0);
	const metric = featured?.metrics[0];
	if (!featured || !metric) return null;
	return (
		<section className="bg-white pt-36 max-md:pt-24">
			<div className={CONTAINER}>
				<Link
					href={caseHref(featured)}
					className="grid items-center gap-8 rounded-[28px] bg-[#eef2f6] px-14 py-12 transition-colors hover:bg-[#e6ecf2] max-md:rounded-[20px] max-md:px-6 max-md:py-9 md:grid-cols-[auto_minmax(0,1fr)_auto]"
				>
					<span className="text-[56px] font-semibold leading-none tracking-[-0.04em] max-md:text-[44px]">{caseMetricText(metric)}</span>
					<span className="text-[17px] leading-[1.5] text-[#2b3538]">
						{metric.description} na {featured.client.name}
						{featured.period ? <span className="text-[#687a80]"> · {featured.period}</span> : null}
					</span>
					<span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#24549c]">
						Ver o case
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</span>
				</Link>
			</div>
		</section>
	);
}

export function LoyaltyFaq() {
	return (
		<section id="perguntas-frequentes" className="scroll-mt-[80px] bg-white py-36 max-md:py-24">
			<div className={`${CONTAINER} grid gap-x-[72px] gap-y-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]`}>
				<div>
					<p className={EYEBROW}>06 · Dúvidas</p>
					<h2 className={H2}>Perguntas sobre programa de fidelidade.</h2>
				</div>
				<div className="flex flex-col border-t border-[#e3e8ea]">
					{LOYALTY_FAQS.map((faq, index) => (
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
	);
}

export function LoyaltyCta() {
	return (
		<section id="cta" className="bg-white px-6 pb-6 max-md:px-3 max-md:pb-3">
			<div
				data-dock="dark"
				className="mx-auto flex max-w-[1352px] flex-col items-center rounded-[28px] bg-[#0b1628] px-12 py-28 text-center text-white max-md:rounded-[20px] max-md:px-5 max-md:py-20"
			>
				<h2 className="max-w-[760px] text-balance text-[56px] font-semibold leading-[1.04] tracking-[-0.04em] max-md:text-[38px]">
					Seu programa de fidelidade pode começar hoje.
				</h2>
				<p className="mt-5 max-w-[560px] text-[18px] leading-[1.6] text-white/66 max-md:text-[16px]">
					A configuração já vem sugerida para o seu segmento. Você ajusta o percentual, a validade e o limite quando quiser.
				</p>
				<div className="mt-9 flex flex-wrap justify-center gap-2.5">
					<TrackedCta
						href={SIGNUP_HREF}
						ctaId="loyalty_cta_trial"
						location="loyalty_cta"
						slug={LOYALTY_SLUG}
						className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-[22px] text-[15px] font-medium text-[#0b1628] transition-colors hover:bg-[#eef2f6]"
					>
						Testar 15 dias grátis
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</TrackedCta>
					<TrackedCta
						href={whatsappHref(LOYALTY_WHATSAPP_TEXT)}
						ctaId="loyalty_cta_especialista"
						location="loyalty_cta"
						slug={LOYALTY_SLUG}
						className="inline-flex h-12 items-center rounded-full border border-white/20 px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-white/8"
					>
						Falar com um especialista
					</TrackedCta>
				</div>
			</div>
		</section>
	);
}

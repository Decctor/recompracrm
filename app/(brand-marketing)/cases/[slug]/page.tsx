import { LANDING_CASES, getCase } from "@/app/_content/cases";
import { getFeaturePage } from "@/app/_content/feature-pages";
import { ArrowUpRight, Calendar, ChartBar, ChevronRight, Coins, type LucideIcon, MessageCircle, Monitor, Play, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseLogo, CaseMetricValue } from "../_components/CaseParts";
import { CasePlayer } from "../_components/CasePlayer";
import { CasesCta } from "../_components/CasesCta";
import { CASES_BASE_URL, caseHref, caseKindLabel, caseMetricText, casePlace, caseThumbnail, caseTitle } from "../_components/case-format";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
	return LANDING_CASES.map((item) => ({ slug: item.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const item = getCase(slug);
	if (!item) return {};

	const title = caseTitle(item);
	const description = [
		`${item.client.name}, ${casePlace(item)}.`,
		item.metrics.length ? `${item.metrics.map((m) => `${m.label}: ${caseMetricText(m)}`).join("; ")}.` : null,
		"Veja o case em vídeo.",
	]
		.filter(Boolean)
		.join(" ");
	const url = `${CASES_BASE_URL}${caseHref(item)}`;

	return {
		title,
		description,
		alternates: { canonical: caseHref(item) },
		openGraph: {
			title: `${title} | RecompraCRM`,
			description,
			url,
			type: "article",
		},
		twitter: { card: "summary_large_image", title: `${title} | RecompraCRM`, description },
	};
}

// Nome curto e ícone de cada funcionalidade citada nos cases; a chamada vem da própria página
// da funcionalidade (`headline`), para não haver duas versões do texto.
const FEATURES: Record<string, { name: string; icon: LucideIcon }> = {
	"programa-de-cashback": { name: "Cashback", icon: Coins },
	"campanhas-whatsapp": { name: "Campanhas no WhatsApp", icon: MessageCircle },
	"ponto-de-interacao": { name: "Ponto de Interação", icon: Monitor },
	"business-intelligence": { name: "Business Intelligence", icon: ChartBar },
};

export default async function CasePage({ params }: Props) {
	const { slug } = await params;
	const item = getCase(slug);
	if (!item) notFound();

	const title = caseTitle(item);
	const kindLabel = caseKindLabel(item);
	const thumbnail = caseThumbnail(item, 1920);
	const features = (item.features ?? []).map((featureSlug) => {
		const meta = FEATURES[featureSlug];
		const page = getFeaturePage(featureSlug);
		return { slug: featureSlug, name: meta?.name ?? page?.title ?? featureSlug, icon: meta?.icon ?? Sparkles, headline: page?.headline ?? "" };
	});
	const others = LANDING_CASES.filter((other) => other.id !== item.id);

	const breadcrumbJsonLd = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "Início", item: CASES_BASE_URL },
			{ "@type": "ListItem", position: 2, name: "Cases", item: `${CASES_BASE_URL}/cases` },
			{ "@type": "ListItem", position: 3, name: item.client.name, item: `${CASES_BASE_URL}${caseHref(item)}` },
		],
	};

	return (
		<>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

			<header id="top" className="pt-[152px] max-md:pt-[112px]">
				<div className="mx-auto max-w-[1240px] px-6">
					<nav aria-label="Trilha" className="mb-12 flex items-center gap-2 text-[14px] max-md:mb-9">
						<Link href="/cases" className="font-medium text-[#0e1214] hover:text-[#24549c]">
							Cases
						</Link>
						<ChevronRight className="h-3.5 w-3.5 flex-none text-[#c9d1d4]" aria-hidden />
						<span className="truncate text-[#687a80]" aria-current="page">
							{item.client.name}
						</span>
					</nav>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-end gap-x-[72px] gap-y-8">
						<div>
							<div className="flex items-center gap-3.5">
								<CaseLogo item={item} size="lg" />
								<span className="min-w-0">
									<span className="block text-[20px] font-semibold tracking-[-0.015em]">{item.client.name}</span>
									<span className="block text-[14px] text-[#687a80]">{casePlace(item)}</span>
								</span>
							</div>
							<h1 className="mt-8 text-[56px] leading-[1.03] font-semibold tracking-[-0.04em] text-balance max-md:text-[38px]">{title}</h1>
						</div>
						<div className="flex max-w-[520px] flex-col gap-3">
							{item.period ? (
								<span className="inline-flex h-[30px] items-center gap-2 self-start rounded-full bg-[#f2f4f4] px-3 text-[13px] font-medium text-[#4b585d]">
									<Calendar className="h-3.5 w-3.5 flex-none" aria-hidden />
									{item.period}
								</span>
							) : null}
							<p className="text-[17px] leading-[1.6] text-[#5b6a70]">{kindLabel}.</p>
						</div>
					</div>

					{item.video && thumbnail ? (
						<CasePlayer
							caseId={item.id}
							playbackId={item.video.muxPlaybackId}
							title={title}
							thumbnail={thumbnail}
							thumbnailAlt={`Depoimento em vídeo de ${item.client.name}`}
							kindLabel={kindLabel}
						/>
					) : null}
				</div>
			</header>

			{item.metrics.length > 0 ? (
				<section aria-labelledby="resultado" className="pt-24 max-md:pt-20">
					<div className="mx-auto max-w-[1240px] px-6">
						<div className="flex flex-wrap items-baseline justify-between gap-3">
							<h2 id="resultado" className="text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-md:text-[32px]">
								O resultado
							</h2>
							{item.period ? <span className="text-[14px] text-[#687a80]">{item.period}</span> : null}
						</div>
						<div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-8 gap-y-10">
							{item.metrics.map((metric) => (
								<div key={metric.label} className="flex flex-col gap-3.5 border-t border-[#0e1214] pt-5">
									<span className="text-[13px] font-semibold text-[#24549c]">{metric.label}</span>
									<CaseMetricValue metric={metric} size="hero" />
									<span className="max-w-[30ch] text-[16px] leading-[1.5] text-[#5b6a70]">{metric.description}</span>
								</div>
							))}
						</div>
					</div>
				</section>
			) : null}

			{item.quote ? (
				<section aria-label="Citação" className="pt-[120px] max-md:pt-20">
					<div className="mx-auto max-w-[1240px] px-6">
						<figure className="flex flex-col gap-8 rounded-[28px] bg-[#eef2f6] px-14 py-16 max-md:gap-6 max-md:rounded-[22px] max-md:px-6 max-md:py-10">
							<span className="text-[72px] leading-[0.6] font-semibold text-[#24549c] max-md:text-[56px]" aria-hidden>
								“
							</span>
							<blockquote className="max-w-[900px] text-[36px] leading-[1.3] font-medium tracking-[-0.025em] text-pretty max-md:text-[24px]">
								{item.quote.text}
							</blockquote>
							{item.quote.author ? (
								<figcaption className="flex items-center gap-3">
									<CaseLogo item={item} size="sm" decorative />
									<span>
										<span className="block text-[16px] font-semibold">{item.quote.author}</span>
										<span className="block text-[14px] text-[#687a80]">{[item.quote.role, item.client.name].filter(Boolean).join(" · ")}</span>
									</span>
								</figcaption>
							) : (
								<figcaption className="text-[14px] text-[#687a80]">
									{item.client.name} · {casePlace(item)}
								</figcaption>
							)}
						</figure>
					</div>
				</section>
			) : null}

			{features.length > 0 ? (
				<section aria-labelledby="com-o-que" className="pt-[120px] max-md:pt-20">
					<div className="mx-auto max-w-[1240px] px-6">
						<h2 id="com-o-que" className="text-[40px] leading-[1.05] font-semibold tracking-[-0.035em] max-md:text-[32px]">
							Com o que foi feito
						</h2>
						<div className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6">
							{features.map((feature) => {
								const Icon = feature.icon;
								return (
									<Link
										key={feature.slug}
										href={`/features/${feature.slug}`}
										className="group flex min-h-[240px] flex-col gap-4 rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-7 text-[#0e1214] transition-[box-shadow,transform] duration-[350ms] hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] max-md:min-h-0 max-md:p-6"
									>
										<span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
											<Icon className="h-5 w-5" aria-hidden />
										</span>
										<span className="text-[14px] font-semibold text-[#24549c]">{feature.name}</span>
										{feature.headline ? (
											<span className="text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-balance">{feature.headline}</span>
										) : null}
										<span className="mt-auto flex items-center justify-between border-t border-[#eef1f2] pt-4 text-[14px] font-medium text-[#5b6a70]">
											Conhecer
											<ArrowUpRight className="h-[18px] w-[18px] text-[#8a979c]" aria-hidden />
										</span>
									</Link>
								);
							})}
						</div>
					</div>
				</section>
			) : null}

			{others.length > 0 ? (
				<section aria-label="Próximo case" className="pt-[120px] max-md:pt-20">
					<div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6">
						{others.map((other) => {
							const otherThumb = caseThumbnail(other, 960);
							return (
								<Link
									key={other.id}
									href={caseHref(other)}
									className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-x-12 gap-y-6 rounded-[28px] border border-[rgba(14,18,20,0.08)] p-6 text-[#0e1214] transition-shadow duration-[350ms] hover:shadow-[0_30px_70px_-36px_rgba(16,24,40,0.45)] max-md:rounded-[22px] max-md:p-3 max-md:pb-6"
								>
									<div className="relative aspect-video overflow-hidden rounded-[18px] bg-[#0b1628] max-md:rounded-[14px]">
										{otherThumb ? (
											<Image
												src={otherThumb}
												alt={`Depoimento em vídeo de ${other.client.name}`}
												fill
												unoptimized
												sizes="(max-width: 760px) 100vw, 600px"
												className="object-cover"
											/>
										) : null}
										{other.video ? (
											<span
												className="absolute top-1/2 left-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffb900] text-[#171717]"
												aria-hidden
											>
												<Play className="ml-[3px] h-5 w-5 fill-current" />
											</span>
										) : null}
									</div>
									<div className="flex flex-col gap-3 max-md:px-3">
										<span className="text-[13px] font-semibold text-[#687a80]">Próximo case</span>
										<span className="text-[28px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance max-md:text-[24px]">{caseTitle(other)}</span>
										<span className="text-[14px] text-[#687a80]">
											{other.client.name} · {casePlace(other)}
										</span>
									</div>
								</Link>
							);
						})}
					</div>
				</section>
			) : null}

			<CasesCta location={`case_${item.id}`} />
		</>
	);
}

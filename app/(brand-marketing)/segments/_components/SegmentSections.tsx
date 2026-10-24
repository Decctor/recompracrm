import type { SegmentPage } from "@/app/_content/segment-pages";
import { ArrowRight, ArrowUpRight, ChartBar, Check, Coins, type LucideIcon, MessageCircle, Monitor } from "lucide-react";
import Link from "next/link";
import { SegmentCard } from "./SegmentCard";
import { lightSurface, SEGMENT_FAMILY_THEMES, shortAudience } from "./segment-families";

const CONTAINER = "mx-auto max-w-[1240px] px-6";

/** Configuração sugerida: o texto ao lado do cartão "Programa de fidelidade" já preenchido. */
export function SegmentConfig({ page }: { page: SegmentPage }) {
	const theme = SEGMENT_FAMILY_THEMES[page.family];
	const config = page.suggestedConfig;
	return (
		<section id="config" className="scroll-mt-[60px] pt-28 max-md:pt-20">
			<div className={`${CONTAINER} grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-x-[72px] gap-y-10`}>
				<div>
					<p className="text-[13px] font-semibold" style={{ color: theme.dark ? "#24549c" : theme.accent }}>
						Configuração sugerida
					</p>
					<h2 className="mt-3.5 text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance max-md:text-[32px]">
						{page.name} já começa com regras do segmento.
					</h2>
					<p className="mt-4 text-[16px] leading-[1.6] text-[#5b6a70]">{config.note}</p>
				</div>
				<div className="min-w-0 rounded-[28px] p-9 max-md:rounded-[22px] max-md:p-3" style={{ background: lightSurface(theme) }}>
					<div className="flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)] max-md:p-4">
						<div>
							<div className="flex flex-wrap items-center gap-2">
								<h3 className="text-[20px] font-extrabold tracking-[-0.025em]">Programa de fidelidade</h3>
								<span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold text-[#15803d]">
									<Check className="size-3" aria-hidden />
									ATIVO
								</span>
							</div>
							<p className="mt-1.5 text-[13px] leading-[1.5] text-[#687a80]">
								Cliente ganha {config.cashbackPercent} de cada venda, válido por {config.expirationDays} dias. Resgata como desconto de até{" "}
								{config.rescueLimit} da compra.
							</p>
						</div>
						<div className="grid grid-cols-3 gap-2 max-md:gap-1.5">
							{config.stats.map((stat) => (
								<div key={stat.label} className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#e3e8ea] px-3 py-3.5 max-md:px-2.5">
									<span className="text-[24px] font-bold tracking-[-0.03em] max-md:text-[19px]">{stat.value}</span>
									<span className="text-[11.5px] leading-[1.4] text-[#687a80] max-md:text-[11px]">{stat.label}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function SegmentChallenge({ page }: { page: SegmentPage }) {
	return (
		<section className="pt-[120px] max-md:pt-20">
			<div
				className={`${CONTAINER} grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-x-20 gap-y-6 border-t border-[#0e1214] pt-12 max-md:pt-8`}
			>
				<h2 className="text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] max-md:text-[32px]">O desafio</h2>
				<div className="flex flex-col gap-[18px] text-[19px] leading-[1.65] text-[#2b3538] max-md:text-[17px]">
					{page.challenge.split("\n\n").map((paragraph) => (
						<p key={paragraph.slice(0, 40)} className="text-pretty">
							{paragraph}
						</p>
					))}
				</div>
			</div>
		</section>
	);
}

const PLAYBOOK_META: Record<string, { name: string; icon: LucideIcon }> = {
	"programa-de-cashback": { name: "Programa de cashback", icon: Coins },
	"campanhas-whatsapp": { name: "Campanhas no WhatsApp", icon: MessageCircle },
	"business-intelligence": { name: "Business Intelligence", icon: ChartBar },
	"ponto-de-interacao": { name: "Ponto de Interação", icon: Monitor },
};

/** As quatro frentes (cashback, WhatsApp, RFM, PDI), cada uma levando à sua funcionalidade. */
export function SegmentPlaybook({ page }: { page: SegmentPage }) {
	const theme = SEGMENT_FAMILY_THEMES[page.family];
	return (
		<section className="pt-[120px] max-md:pt-20">
			<div className={CONTAINER}>
				<h2 className="max-w-[720px] text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance max-md:text-[32px]">
					Quatro frentes para {shortAudience(page)}
				</h2>
				<div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-3 rounded-[28px] bg-[#eef2f6] p-3 max-md:mt-8 max-md:rounded-[22px] max-md:p-2">
					{page.playbook.map((item, i) => {
						const meta = PLAYBOOK_META[item.featureSlug];
						const Icon = meta?.icon ?? Coins;
						return (
							<Link
								key={item.featureSlug}
								href={`/features/${item.featureSlug}`}
								className="grid grid-cols-[44px_minmax(0,1fr)] gap-[18px] rounded-[20px] bg-white p-7 text-[#0e1214] transition-shadow duration-300 hover:shadow-[0_20px_48px_-30px_rgba(16,24,40,0.4)] max-md:grid-cols-1 max-md:gap-4 max-md:rounded-[16px] max-md:p-5"
							>
								<span
									className="flex size-11 items-center justify-center rounded-full"
									style={{ background: theme.dark ? "#0e1214" : theme.bg, color: theme.accent }}
								>
									<Icon className="size-5" aria-hidden />
								</span>
								<div className="flex min-w-0 flex-col gap-2">
									<span className="text-[12px] font-semibold text-[#8a979c]">{String(i + 1).padStart(2, "0")}</span>
									<h3 className="text-[20px] font-semibold tracking-[-0.02em]">{item.title}</h3>
									<p className="text-[15px] leading-[1.6] text-[#5b6a70]">{item.body}</p>
									<span className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#24549c]">
										{meta?.name ?? "Saiba mais"}
										<ArrowUpRight className="size-3.5 flex-none" aria-hidden />
									</span>
								</div>
							</Link>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function formatUpdatedAt(iso: string) {
	return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** "O que muda": a definição extraível (AEO) ao lado do resultado esperado. */
export function SegmentOutcome({ page }: { page: SegmentPage }) {
	return (
		<section className="px-6 pt-[120px] max-md:px-3 max-md:pt-20">
			<div
				data-dock="dark"
				className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-x-[72px] gap-y-8 rounded-[28px] bg-[#0b1628] px-14 py-[72px] text-white max-md:rounded-[20px] max-md:px-5 max-md:py-12"
			>
				<div>
					<p className="text-[13px] font-semibold text-[#ffb900]">O que muda</p>
					<p className="mt-3.5 text-[15px] leading-[1.6] text-white/60">{page.answerBlock}</p>
					<p className="mt-4 text-[12px] text-white/40">Atualizado em {formatUpdatedAt(page.updatedAt)}</p>
				</div>
				<p className="text-[30px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty max-md:text-[24px]">{page.result}</p>
			</div>
		</section>
	);
}

export function SegmentRelated({ segments }: { segments: SegmentPage[] }) {
	if (segments.length === 0) return null;
	return (
		<section className="pt-[120px] max-md:pt-20">
			<div className={CONTAINER}>
				<div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-t border-[#e3e8ea] pt-12 max-md:pt-8">
					<h2 className="text-[32px] font-semibold tracking-[-0.03em] max-md:text-[28px]">Segmentos parecidos</h2>
					<Link
						href="/segments#segmentos"
						className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0e1214] transition-colors hover:text-[#24549c]"
					>
						Todos os segmentos
						<ArrowRight className="size-4 flex-none" aria-hidden />
					</Link>
				</div>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
					{segments.map((segment) => (
						<SegmentCard key={segment.slug} segment={segment} variant="related" />
					))}
				</div>
			</div>
		</section>
	);
}

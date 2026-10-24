import type { ContentSection } from "@/app/_content/blog-posts";
import type { TIsoIconKey } from "@/components/Illustrations/Isometric/IsoIcon";
import {
	BadgeCheck,
	Calculator,
	Calendar,
	ChartColumn,
	Check,
	Clock,
	Coins,
	CreditCard,
	Flame,
	Gift,
	Heart,
	Lightbulb,
	ListChecks,
	Lock,
	type LucideIcon,
	MessageCircle,
	Monitor,
	Plug,
	Settings,
	ShoppingBag,
	Smartphone,
	Sparkles,
	Store,
	Tag,
	Target,
	TriangleAlert,
	Trophy,
	Zap,
} from "lucide-react";
import { ArticleRichText, formatInline, headingAnchor } from "./article-text";
import { CashbackCalculator } from "./CashbackCalculator";

type ArticleSectionProps = {
	section: ContentSection;
};

// Cada bloco carrega a própria margem de baixo (56px), e não um `gap` do pai: assim o mesmo
// componente se espaça certo no artigo do blog e nas páginas de funcionalidade, que o usam em fluxo
// normal. Destaques seguidos viram uma lista com fio entre os itens — o segundo em diante anula a
// margem do anterior (as margens se somam e dão zero).
const BLOCK = "mb-14";

// Os tons dos callouts usam valores fixos e claros: as páginas de marketing são sempre claras, e as
// classes semânticas (`bg-info-surface`…) inverteriam no tema escuro do sistema dentro de uma página branca.
const CALLOUT_TONES = {
	dica: { label: "Na prática", icon: Lightbulb, surface: "bg-[#eef3fb]", accent: "text-[#24549c]" },
	atencao: { label: "Atenção", icon: TriangleAlert, surface: "bg-[#fff7e5]", accent: "text-[#7a5117]" },
	dado: { label: "O dado", icon: ChartColumn, surface: "bg-[#f6f8fa]", accent: "text-[#0e1214]" },
} as const;

// Os destaques guardam a chave do ícone isométrico (o mesmo contrato das páginas de funcionalidade);
// no blog redesenhado eles viram ícones de traço do lucide. O Record obriga a mapear toda chave nova.
const FEATURE_ICONS: Record<TIsoIconKey, LucideIcon> = {
	store: Store,
	calendar: Calendar,
	phone: Smartphone,
	chat: MessageCircle,
	coins: Coins,
	chart: ChartColumn,
	gift: Gift,
	bag: ShoppingBag,
	checklist: ListChecks,
	card: CreditCard,
	tag: Tag,
	clock: Clock,
	monitor: Monitor,
	target: Target,
	calculator: Calculator,
	gear: Settings,
	heart: Heart,
	bolt: Zap,
	sparkle: Sparkles,
	flame: Flame,
	check: Check,
	trophy: Trophy,
	lock: Lock,
	plug: Plug,
};

// `data-outline` alimenta o "Lendo · <seção>" do Dock no artigo; o id, o sumário lateral e links diretos.
function SectionHeading({ children }: { children: string }) {
	return (
		<h2
			id={headingAnchor(children)}
			data-outline={children}
			className="m-0 mb-5 scroll-mt-[110px] text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0e1214] text-balance sm:text-[32px]"
		>
			{children}
		</h2>
	);
}

export function ArticleSection({ section }: ArticleSectionProps) {
	if (section.type === "text") {
		return (
			<section className={BLOCK}>
				{section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
				<div className="flex flex-col gap-5 text-[17px] leading-[1.7] text-[#2b3538] sm:text-lg">
					<ArticleRichText body={section.body} />
				</div>
			</section>
		);
	}

	if (section.type === "feature-highlight") {
		const Icon = FEATURE_ICONS[section.icon] ?? BadgeCheck;
		return (
			<section
				data-block="feature-highlight"
				className={`${BLOCK} grid grid-cols-[44px_minmax(0,1fr)] gap-5 border-t border-[#e3e8ea] py-6 [[data-block=feature-highlight]+&]:-mt-14`}
			>
				<span className="flex size-11 items-center justify-center rounded-full bg-[#eef2f6] text-[#24549c]">
					<Icon className="size-5" aria-hidden />
				</span>
				<div className="min-w-0">
					<h3 id={headingAnchor(section.title)} className="m-0 scroll-mt-[110px] text-xl font-semibold leading-[1.3] tracking-[-0.02em] text-[#0e1214]">
						{section.title}
					</h3>
					<div className="mt-2 flex flex-col gap-3 text-base leading-[1.65] text-[#5b6a70]">
						<ArticleRichText body={section.body} />
					</div>
				</div>
			</section>
		);
	}

	if (section.type === "stats") {
		return (
			<section className={`${BLOCK} grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-6 text-numeric`}>
				{section.items.map((item) => (
					<div key={item.value + item.label} className="flex flex-col gap-2.5 border-t border-[#0e1214] pt-5">
						<p className="m-0 text-[48px] font-medium leading-none tracking-[-0.045em] text-[#0e1214]">{item.value}</p>
						<p className="m-0 text-[15px] leading-[1.45] text-[#5b6a70]">{item.label}</p>
						{item.source ? <p className="m-0 mt-auto text-xs leading-[1.4] text-[#8a979c]">Fonte: {item.source}</p> : null}
					</div>
				))}
			</section>
		);
	}

	// Citação e imagem não estavam no protótipo: seguem o mesmo sistema — fio escuro no topo como os
	// números, tipografia de título, legenda em cinza de metadado.
	if (section.type === "quote") {
		return (
			<figure className={`${BLOCK} mx-0 border-t border-[#0e1214] pt-6`}>
				<blockquote className="m-0 text-[22px] font-medium leading-[1.35] tracking-[-0.02em] text-[#0e1214] text-balance sm:text-[26px]">
					<span aria-hidden className="text-[#24549c]">
						“
					</span>
					{section.text}
					<span aria-hidden className="text-[#24549c]">
						”
					</span>
				</blockquote>
				{section.author ? <figcaption className="mt-4 text-sm font-medium text-[#687a80]">{section.author}</figcaption> : null}
			</figure>
		);
	}

	if (section.type === "image") {
		return (
			<figure className={`${BLOCK} mx-0`}>
				<img
					src={section.src}
					alt={section.alt}
					loading="lazy"
					className="block w-full rounded-[20px] border border-[rgba(14,18,20,0.08)] bg-[#f6f8fa] object-cover"
				/>
				{section.caption ? <figcaption className="mt-3 text-sm leading-[1.6] text-[#687a80]">{section.caption}</figcaption> : null}
			</figure>
		);
	}

	if (section.type === "callout") {
		const tone = CALLOUT_TONES[section.tone];
		const Icon = tone.icon;
		return (
			<aside className={`${BLOCK} rounded-3xl px-6 py-6 sm:px-8 sm:py-7 ${tone.surface}`}>
				<p className={`m-0 flex items-center gap-2 text-[13px] font-semibold ${tone.accent}`}>
					<Icon className="size-4" aria-hidden />
					{tone.label}
				</p>
				<p className="m-0 mt-3 text-[21px] font-semibold leading-[1.3] tracking-[-0.02em] text-[#0e1214]">{section.title}</p>
				<div className="mt-2.5 flex flex-col gap-3 text-base leading-[1.65] text-[#2b3538]">
					<ArticleRichText body={section.body} />
				</div>
			</aside>
		);
	}

	if (section.type === "table") {
		return (
			<section className={BLOCK}>
				{section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
				{/* A rolagem horizontal fica dentro da moldura: em telas médias e no celular a tabela rola, a página não. */}
				<div className="overflow-x-auto rounded-[20px] border border-[#e3e8ea]">
					<table className="w-full min-w-[560px] border-collapse text-left text-[15px] leading-[1.5] text-numeric">
						<thead>
							<tr className="bg-[#f6f8fa]">
								{section.columns.map((col) => (
									<th key={col} scope="col" className="px-[18px] py-3.5 text-xs font-semibold text-[#687a80]">
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{section.rows.map((row) => (
								<tr key={row.join("|")} className="border-t border-[#e3e8ea]">
									{row.map((cell, j) =>
										j === 0 ? (
											<th key={j} scope="row" className="min-w-[120px] px-[18px] py-4 align-top font-semibold text-[#0e1214]">
												{formatInline(cell)}
											</th>
										) : (
											<td key={j} className="px-[18px] py-4 align-top text-[#5b6a70]">
												{formatInline(cell)}
											</td>
										),
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{section.note ? <p className="m-0 mt-3 text-sm leading-[1.6] text-[#687a80]">{formatInline(section.note)}</p> : null}
			</section>
		);
	}

	if (section.type === "timeline") {
		return (
			<section className={BLOCK}>
				{section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
				<ol className="m-0 flex list-none flex-col p-0">
					{section.items.map((item) => (
						<li key={item.date + item.title} className="grid gap-x-6 gap-y-1.5 border-t border-[#e3e8ea] py-5 sm:grid-cols-[96px_minmax(0,1fr)]">
							<span className="pt-1 text-[13px] font-semibold text-[#24549c] text-numeric">{item.date}</span>
							<div>
								<h3 className="m-0 text-[19px] font-semibold leading-[1.35] tracking-[-0.015em] text-[#0e1214]">{item.title}</h3>
								<div className="mt-1.5 flex flex-col gap-3 text-base leading-[1.65] text-[#5b6a70]">
									<ArticleRichText body={item.body} />
								</div>
							</div>
						</li>
					))}
				</ol>
			</section>
		);
	}

	if (section.type === "cashback-calculator") {
		return (
			<section className={BLOCK}>
				{section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
				<CashbackCalculator />
			</section>
		);
	}

	return null;
}

// Itens do sumário: só os títulos que estruturam o texto (não os blocos de destaque).
export function getArticleOutline(sections: ContentSection[]) {
	return sections.flatMap((section) => {
		if (
			(section.type === "text" || section.type === "table" || section.type === "timeline" || section.type === "cashback-calculator") &&
			section.heading
		) {
			return [{ id: headingAnchor(section.heading), label: section.heading }];
		}
		return [];
	});
}

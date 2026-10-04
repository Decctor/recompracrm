import type { ContentSection } from "@/app/_content/blog-posts";
import { IsoIcon } from "@/components/Illustrations/Isometric/IsoIcon";
import { BarChart3, Lightbulb, TriangleAlert } from "lucide-react";
import { ArticleRichText, formatInline, headingAnchor } from "./article-text";
import { CashbackCalculator } from "./CashbackCalculator";

type ArticleSectionProps = {
	section: ContentSection;
};

// Os tons dos callouts usam os valores CLAROS dos tokens semânticos (DESIGN.md §2): as páginas de
// marketing são sempre claras, e as classes `bg-info-surface`… inverteriam no tema escuro do
// sistema dentro de uma página branca.
const CALLOUT_TONES = {
	dica: { label: "Na prática", icon: Lightbulb, surface: "bg-[#eef3fb] border-[#24549C]/15", accent: "text-[#24549C]" },
	atencao: { label: "Atenção", icon: TriangleAlert, surface: "bg-[#fff7e5] border-[#FFB900]/35", accent: "text-[#7a5117]" },
	dado: { label: "O dado", icon: BarChart3, surface: "bg-slate-50 border-slate-200", accent: "text-slate-900" },
} as const;

function SectionHeading({ children, id }: { children: string; id?: string }) {
	return (
		<h2 id={id ?? headingAnchor(children)} className="mb-5 scroll-mt-28 text-2xl font-extrabold leading-[1.15] tracking-[-0.015em] text-slate-900 sm:text-[28px]">
			{children}
		</h2>
	);
}

export function ArticleSection({ section }: ArticleSectionProps) {
	if (section.type === "text") {
		return (
			<section className="mb-12">
				{section.heading && <SectionHeading>{section.heading}</SectionHeading>}
				<div className="space-y-5 text-[17px]">
					<ArticleRichText body={section.body} />
				</div>
			</section>
		);
	}

	if (section.type === "feature-highlight") {
		return (
			<section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
				<div className="flex flex-col gap-5 sm:flex-row sm:items-start">
					<div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-[#eef3fb]">
						<IsoIcon icon={section.icon} className="h-[68px] w-[76px]" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 id={headingAnchor(section.title)} className="mb-3 scroll-mt-28 text-lg font-extrabold leading-snug tracking-[-0.01em] text-slate-900 sm:text-xl">
							{section.title}
						</h3>
						<div className="space-y-4 text-base">
							<ArticleRichText body={section.body} className="text-slate-600" />
						</div>
					</div>
				</div>
			</section>
		);
	}

	if (section.type === "stats") {
		return (
			<section className="mb-12 overflow-hidden rounded-3xl border border-slate-200">
				<div className="text-numeric grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-3">
					{section.items.map((item) => (
						<div key={item.value + item.label} className="flex flex-col gap-2 bg-white p-6">
							<p className="text-4xl font-extrabold leading-none tracking-[-0.025em] text-[#24549C]">{item.value}</p>
							<p className="text-sm leading-snug text-slate-600">{item.label}</p>
							{item.source && <p className="mt-auto pt-2 text-micro text-slate-400">Fonte: {item.source}</p>}
						</div>
					))}
				</div>
			</section>
		);
	}

	if (section.type === "quote") {
		return (
			<figure className="mb-12 py-2">
				<svg aria-hidden viewBox="0 0 32 24" className="mb-4 h-6 w-8 fill-[#FFB900]">
					<path d="M0 24V14C0 6 4 1.5 12 0l1.5 3.5C9 5 7 8 7 11h6v13H0Zm19 0V14c0-8 4-12.5 12-14l1 3.5C27.5 5 26 8 26 11h6v13H19Z" />
				</svg>
				<blockquote className="text-2xl font-bold leading-[1.3] tracking-[-0.015em] text-slate-900 sm:text-[28px]">{section.text}</blockquote>
				{section.author && <figcaption className="mt-4 text-label text-slate-500">{section.author}</figcaption>}
			</figure>
		);
	}

	if (section.type === "image") {
		return (
			<figure className="mb-12">
				<img src={section.src} alt={section.alt} loading="lazy" className="w-full rounded-3xl border border-slate-200 object-cover" />
				{section.caption && <figcaption className="mt-3 text-sm text-slate-500">{section.caption}</figcaption>}
			</figure>
		);
	}

	if (section.type === "callout") {
		const tone = CALLOUT_TONES[section.tone];
		const Icon = tone.icon;
		return (
			<aside className={`mb-12 rounded-2xl border p-5 sm:p-6 ${tone.surface}`}>
				<p className={`mb-2 flex items-center gap-2 text-label ${tone.accent}`}>
					<Icon className="size-4" aria-hidden />
					{tone.label}
				</p>
				<p className="mb-2 text-lg font-extrabold leading-snug text-slate-900">{section.title}</p>
				<div className="space-y-3 text-base">
					<ArticleRichText body={section.body} className="text-slate-700" />
				</div>
			</aside>
		);
	}

	if (section.type === "table") {
		return (
			<section className="mb-12">
				{section.heading && <SectionHeading>{section.heading}</SectionHeading>}
				{/* ≥ sm: tabela de verdade */}
				<div className="hidden overflow-hidden rounded-2xl border border-slate-200 sm:block">
					<table className="text-numeric w-full border-collapse text-left text-[15px]">
						<thead className="bg-slate-50">
							<tr>
								{section.columns.map((col) => (
									<th key={col} scope="col" className="px-4 py-3 text-label text-slate-500">
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{section.rows.map((row) => (
								<tr key={row.join("|")} className="border-t border-slate-200">
									{row.map((cell, j) =>
										j === 0 ? (
											<th key={j} scope="row" className="px-4 py-3.5 font-bold text-slate-900">
												{formatInline(cell)}
											</th>
										) : (
											<td key={j} className="px-4 py-3.5 text-slate-600">
												{formatInline(cell)}
											</td>
										),
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{/* < sm: cada linha vira um cartão, rótulo acima do valor — quatro colunas não cabem em 360px e as células são frases */}
				<div className="text-numeric divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 sm:hidden">
					{section.rows.map((row) => (
						<dl key={row.join("|")} className="space-y-2 p-4">
							<dt className="font-bold text-slate-900">{formatInline(row[0])}</dt>
							{row.slice(1).map((cell, j) => (
								<div key={j} className="text-sm">
									<dt className="text-micro text-slate-400">{section.columns[j + 1]}</dt>
									<dd className="leading-snug text-slate-700">{formatInline(cell)}</dd>
								</div>
							))}
						</dl>
					))}
				</div>
				{section.note && <p className="mt-3 text-sm leading-relaxed text-slate-500">{formatInline(section.note)}</p>}
			</section>
		);
	}

	if (section.type === "timeline") {
		return (
			<section className="mb-12">
				{section.heading && <SectionHeading>{section.heading}</SectionHeading>}
				<ol className="relative space-y-7 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-slate-200">
					{section.items.map((item) => (
						<li key={item.date + item.title} className="relative pl-9">
							<span aria-hidden className="absolute top-1.5 left-0 size-[15px] rounded-full border-[3px] border-white bg-[#24549C] ring-1 ring-[#24549C]/25" />
							<p className="mb-1.5 inline-block rounded-full bg-[#FFB900]/18 px-3 py-1 text-label text-slate-900">{item.date}</p>
							<h3 className="mb-1.5 text-lg font-extrabold leading-snug text-slate-900">{item.title}</h3>
							<div className="space-y-3 text-base">
								<ArticleRichText body={item.body} className="text-slate-600" />
							</div>
						</li>
					))}
				</ol>
			</section>
		);
	}

	if (section.type === "cashback-calculator") {
		return (
			<section className="mb-12">
				{section.heading && <SectionHeading>{section.heading}</SectionHeading>}
				<CashbackCalculator />
			</section>
		);
	}

	return null;
}

// Itens do sumário: só os títulos que estruturam o texto (não os blocos de destaque).
export function getArticleOutline(sections: ContentSection[]) {
	return sections.flatMap((section) => {
		if ((section.type === "text" || section.type === "table" || section.type === "timeline" || section.type === "cashback-calculator") && section.heading) {
			return [{ id: headingAnchor(section.heading), label: section.heading }];
		}
		return [];
	});
}

"use client";

import type { THelpArticle } from "@/app/_content/help-articles";
import { ConnectorMark } from "@/components/Brand/ConnectorMark";
import { ArrowRight, Clock3, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

export function HelpCenterSearch({ articles }: { articles: THelpArticle[] }) {
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("pt-BR"));
	const filteredArticles = deferredQuery
		? articles.filter((article) =>
				`${article.title} ${article.description} ${article.categoryLabel}`.toLocaleLowerCase("pt-BR").includes(deferredQuery),
			)
		: articles;

	return (
		<>
			<label className="relative mx-auto block w-full max-w-2xl">
				<span className="sr-only">Buscar na Central de Ajuda</span>
				<Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
				<input
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Buscar na Central de Ajuda"
					className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-13 pr-5 text-base text-slate-900 shadow-[0_18px_45px_-28px_rgba(36,84,156,0.5)] outline-none transition focus:border-[#24549C] focus:ring-4 focus:ring-[#24549C]/10"
				/>
			</label>

			<div className="mt-12" aria-live="polite">
				{filteredArticles.length > 0 ? (
					<div className="grid gap-5">
						{filteredArticles.map((article) => (
							<Link
								key={article.slug}
								href={`/help/${article.slug}`}
								className="group relative overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-300 hover:-translate-y-0.5 hover:border-[#D97757]/40 hover:shadow-[0_18px_50px_-32px_rgba(36,84,156,0.55)] sm:p-8"
							>
								<div className="flex flex-col gap-6 sm:flex-row sm:items-center">
									<div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-[#D97757]/10">
										<ConnectorMark connectorCode={article.connectorCode} className="size-9" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-[#D97757]">{article.categoryLabel}</p>
										<h2 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">{article.title}</h2>
										<p className="mt-2 max-w-2xl leading-relaxed text-slate-600">{article.description}</p>
										<div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
											<span className="rounded-full bg-slate-100 px-3 py-1.5">{article.stepCount} passos</span>
											<span className="flex items-center gap-1.5">
												<Clock3 className="size-3.5" /> {article.readingTime}
											</span>
										</div>
									</div>
									<ArrowRight className="size-5 shrink-0 text-[#24549C] transition-transform duration-300 group-hover:translate-x-1" />
								</div>
							</Link>
						))}
					</div>
				) : (
					<div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
						<p className="font-bold text-slate-900">Ainda não temos um tutorial sobre isso.</p>
						<p className="mt-2 text-sm text-slate-500">Novos conteúdos serão publicados em breve.</p>
					</div>
				)}
			</div>
		</>
	);
}

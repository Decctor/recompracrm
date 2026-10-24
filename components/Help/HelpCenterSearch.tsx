"use client";

import type { THelpArticle } from "@/app/_content/help-articles";
import { ConnectorMark } from "@/components/Brand/ConnectorMark";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useDeferredValue, useState } from "react";

// Ignora caixa e acentos: "integracao" encontra "Integração".
function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLocaleLowerCase("pt-BR");
}

type HelpCenterSearchProps = {
	articles: THelpArticle[];
	// Selo, título e texto do topo (renderizados no servidor), acima do campo de busca.
	intro: ReactNode;
};

// Topo da Central de Ajuda + grade de tutoriais. A busca fica no topo e o resultado na seção
// `#tutoriais` logo abaixo, por isso as duas partes moram no mesmo componente cliente.
export function HelpCenterSearch({ articles, intro }: HelpCenterSearchProps) {
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(normalize(query.trim()));
	const filteredArticles = deferredQuery
		? articles.filter((article) => normalize(`${article.title} ${article.description} ${article.categoryLabel}`).includes(deferredQuery))
		: articles;
	const resultLabel = deferredQuery
		? `${filteredArticles.length} resultado${filteredArticles.length === 1 ? "" : "s"}`
		: `${articles.length} tutoria${articles.length === 1 ? "l" : "is"}`;

	return (
		<>
			<header id="top" className="border-b border-[#eef1f2] pt-[120px] pb-16 sm:pt-[168px] sm:pb-24">
				<div className="mx-auto flex max-w-[960px] flex-col items-center px-6 text-center">
					{intro}
					<label className="mt-10 flex h-[60px] w-full max-w-[640px] items-center gap-3 rounded-full border border-[#e3e8ea] bg-white pr-2 pl-5 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_20px_48px_-28px_rgba(16,24,40,0.35)] transition-[border-color,box-shadow] focus-within:border-[#24549c] focus-within:shadow-[0_0_0_4px_rgba(36,84,156,0.1),0_20px_48px_-28px_rgba(16,24,40,0.35)] sm:pl-[22px]">
						<span className="sr-only">Buscar na Central de Ajuda</span>
						<Search className="size-5 flex-none text-[#687a80]" aria-hidden />
						<input
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Buscar tutorial, integração ou recurso"
							className="h-full min-w-0 flex-1 border-0 bg-transparent text-base text-[#0e1214] outline-none placeholder:text-[#8a979c] sm:text-[17px]"
						/>
						<span
							aria-hidden
							className="hidden h-11 flex-none items-center whitespace-nowrap rounded-full bg-[#0e1214] px-[18px] text-sm font-medium leading-[normal] text-white min-[420px]:inline-flex"
						>
							{resultLabel}
						</span>
					</label>
				</div>
			</header>

			<section id="tutoriais" className="scroll-mt-[60px] pt-20 sm:pt-24">
				<div className="mx-auto max-w-[1240px] px-6">
					<h2 className="m-0 mb-8 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">Tutoriais</h2>
					<p className="sr-only" aria-live="polite">
						{resultLabel}
					</p>
					{filteredArticles.length > 0 ? (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-6">
							{filteredArticles.map((article) => (
								<Link
									key={article.slug}
									href={`/help/${article.slug}`}
									className="group flex min-h-[280px] flex-col gap-[18px] rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] sm:p-7"
								>
									<div className="flex items-center justify-between gap-3">
										<span className="flex size-[52px] items-center justify-center rounded-2xl bg-[rgba(217,119,87,0.12)]">
											<ConnectorMark connectorCode={article.connectorCode} className="size-6" />
										</span>
										<span className="text-[13px] font-semibold leading-[normal] text-[#c2603f]">{article.categoryLabel}</span>
									</div>
									<h3 className="m-0 text-[22px] font-semibold leading-[1.2] tracking-[-0.025em] text-balance sm:text-2xl">{article.title}</h3>
									<p className="m-0 text-[15px] leading-[1.6] text-[#5b6a70]">{article.description}</p>
									<div className="mt-auto flex items-center justify-between gap-3 border-t border-[#eef1f2] pt-4 text-[13px] leading-[normal] text-[#687a80]">
										<span>
											{article.stepCount} passos · {article.readingTime}
										</span>
										<ArrowUpRight
											className="size-[18px] text-[#8a979c] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
											aria-hidden
										/>
									</div>
								</Link>
							))}
						</div>
					) : (
						<div className="rounded-3xl bg-[#f6f8fa] px-6 py-12 text-center text-base leading-[1.5] text-[#5b6a70] sm:p-12">
							Nenhum tutorial encontrado para “{query.trim()}”.
						</div>
					)}
				</div>
			</section>
		</>
	);
}

"use client";

import { BLOG_CATEGORIES, type BlogCategory, type BlogPost } from "@/app/_content/blog-posts";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BlogPostCard } from "./BlogPostCard";

type BlogPostGridProps = {
	posts: BlogPost[];
	// O destaque já aparece acima da grade; só volta para ela quando há filtro ativo.
	featuredSlug?: string;
};

function parseCategory(raw: string | null): BlogCategory | null {
	return BLOG_CATEGORIES.some((c) => c.value === raw) ? (raw as BlogCategory) : null;
}

// Filtro por categoria no cliente. O estado inicial vem de ?categoria= (o link da trilha do artigo);
// trocar de categoria só reescreve a URL com `history.replaceState`, sem navegação nem rolagem. O
// fallback do <Suspense> no servidor é a lista completa, então o índice continua estático.
export function BlogPostGrid({ posts, featuredSlug }: BlogPostGridProps) {
	const params = useSearchParams();
	const [active, setActive] = useState<BlogCategory | null>(() => parseCategory(params.get("categoria")));

	const select = (value: BlogCategory | null) => {
		setActive(value);
		const url = new URL(window.location.href);
		if (value) url.searchParams.set("categoria", value);
		else url.searchParams.delete("categoria");
		window.history.replaceState(window.history.state, "", url);
	};

	return <BlogPostGridView posts={posts} featuredSlug={featuredSlug} active={active} onSelect={select} />;
}

type BlogPostGridViewProps = BlogPostGridProps & {
	active: BlogCategory | null;
	onSelect?: (value: BlogCategory | null) => void;
};

export function BlogPostGridView({ posts, featuredSlug, active, onSelect }: BlogPostGridViewProps) {
	const visible = active ? posts.filter((p) => p.category === active) : posts.filter((p) => p.slug !== featuredSlug);
	const chips = [
		{ value: null, label: "Todos", count: posts.length },
		...BLOG_CATEGORIES.map((c) => ({ ...c, count: posts.filter((p) => p.category === c.value).length })),
	].filter((chip) => chip.count > 0);

	return (
		<>
			<div className="mb-10 flex flex-wrap items-end justify-between gap-6">
				<h2 className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[40px]">Todos os artigos</h2>
				<div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-0.5 rounded-[22px] bg-[#f2f4f4] p-1 sm:rounded-full">
					{chips.map((chip) => {
						const on = chip.value === active;
						return (
							<button
								key={chip.label}
								type="button"
								aria-pressed={on}
								onClick={() => onSelect?.(chip.value)}
								className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
									on
										? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_2px_8px_-2px_rgba(16,24,40,0.1)]"
										: "bg-transparent text-[#5b6a70] hover:text-[#0e1214]"
								}`}
							>
								{chip.label}
								<span className={`text-xs text-numeric ${on ? "text-[#24549c]" : "text-[#8a979c]"}`}>{chip.count}</span>
							</button>
						);
					})}
				</div>
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6">
				{visible.map((post) => (
					<BlogPostCard key={post.slug} post={post} />
				))}
			</div>
		</>
	);
}

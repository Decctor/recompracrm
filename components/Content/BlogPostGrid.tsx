"use client";

import { BLOG_CATEGORIES, type BlogCategory, type BlogPost } from "@/app/_content/blog-posts";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BlogPostCard } from "./BlogPostCard";

type BlogPostGridProps = {
	posts: BlogPost[];
	// O destaque já aparece acima da grade; só volta para ela quando há filtro ativo.
	featuredSlug?: string;
};

// Filtro por categoria via ?categoria= (o mesmo link da trilha do artigo). Fica no cliente para o
// índice continuar estático: o fallback do <Suspense> no servidor é a lista completa.
export function BlogPostGrid({ posts, featuredSlug }: BlogPostGridProps) {
	const params = useSearchParams();
	const raw = params.get("categoria");
	const active = BLOG_CATEGORIES.some((c) => c.value === raw) ? (raw as BlogCategory) : null;
	return <BlogPostGridView posts={posts} featuredSlug={featuredSlug} active={active} />;
}

export function BlogPostGridView({ posts, featuredSlug, active }: BlogPostGridProps & { active: BlogCategory | null }) {
	const visible = active ? posts.filter((p) => p.category === active) : posts.filter((p) => p.slug !== featuredSlug);
	const counts = new Map(BLOG_CATEGORIES.map((c) => [c.value, posts.filter((p) => p.category === c.value).length]));
	const chips = [{ value: null, label: "Todos", count: posts.length }, ...BLOG_CATEGORIES.map((c) => ({ ...c, count: counts.get(c.value) ?? 0 }))].filter(
		(chip) => chip.count > 0,
	);

	return (
		<>
			<nav aria-label="Categorias" className="mb-8 flex flex-wrap gap-2">
				{chips.map((chip) => {
					const isActive = chip.value === active;
					return (
						<Link
							key={chip.label}
							href={chip.value ? `/blog?categoria=${chip.value}#artigos` : "/blog#artigos"}
							scroll={false}
							aria-current={isActive ? "page" : undefined}
							className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors ${
								isActive ? "border-[#24549C] bg-[#24549C] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#24549C]/40 hover:text-[#24549C]"
							}`}
						>
							{chip.label}
							<span className={`text-numeric text-xs ${isActive ? "text-white/70" : "text-slate-400"}`}>{chip.count}</span>
						</Link>
					);
				})}
			</nav>
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{visible.map((post) => (
					<BlogPostCard key={post.slug} post={post} />
				))}
			</div>
		</>
	);
}

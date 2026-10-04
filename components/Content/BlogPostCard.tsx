import type { BlogPost } from "@/app/_content/blog-posts";
import { IsoCover } from "@/components/Illustrations/Isometric/IsoCover";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatArticleDate } from "./article-dates";

type BlogPostCardProps = {
	post: BlogPost;
	// "featured": cartão largo do topo do índice, com a capa em azul profundo ao lado do texto.
	variant?: "default" | "featured";
};

export function BlogPostCard({ post, variant = "default" }: BlogPostCardProps) {
	const featured = variant === "featured";

	return (
		<Link
			href={`/blog/${post.slug}`}
			className={`group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-[#24549C]/25 hover:shadow-[0_12px_32px_-12px_rgba(36,84,156,0.18),0_4px_8px_rgba(0,0,0,0.04)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#24549C]/30 ${featured ? "lg:flex-row" : ""}`}
		>
			<div className={`relative overflow-hidden ${featured ? "lg:w-[56%] lg:shrink-0" : ""}`}>
				<IsoCover
					scene={post.cover}
					tone={featured ? "deep" : "soft"}
					className={`block w-full transition-transform duration-500 group-hover:scale-[1.03] ${featured ? "aspect-[16/10] lg:h-full lg:aspect-auto" : "aspect-[16/10]"}`}
				/>
			</div>

			<div className={`flex flex-1 flex-col ${featured ? "p-7 sm:p-9 lg:justify-center" : "p-6"}`}>
				<div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
					{featured && <span className="rounded-full bg-[#FFB900] px-3 py-1 text-label text-slate-900">Mais recente</span>}
					<span className="text-label text-[#24549C]">{post.categoryLabel}</span>
				</div>

				<h3
					className={`mb-3 font-extrabold leading-[1.15] tracking-[-0.015em] text-slate-900 text-balance transition-colors group-hover:text-[#24549C] ${featured ? "text-2xl sm:text-[32px]" : "text-lg sm:text-xl"}`}
				>
					{post.title}
				</h3>

				<p className={`mb-6 flex-1 leading-relaxed text-slate-500 ${featured ? "text-base sm:text-lg" : "text-[15px]"}`}>{post.headline}</p>

				<div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-sm text-slate-400">
					<span>
						<time dateTime={post.publishedAt}>{formatArticleDate(post.publishedAt, "short")}</time>
						<span aria-hidden> · </span>
						{post.readingTime} de leitura
					</span>
					<ArrowUpRight
						className="size-5 shrink-0 text-slate-300 transition-[color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#24549C]"
						aria-hidden
					/>
				</div>
			</div>
		</Link>
	);
}

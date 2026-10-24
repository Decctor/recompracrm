import type { BlogPost } from "@/app/_content/blog-posts";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatArticleDate } from "./article-dates";
import { DataCover } from "./DataCover";

type BlogPostCardProps = {
	post: BlogPost;
	// "featured": cartão largo do topo do índice, capa de dados ao lado do texto.
	// "compact": "Leia também" — só título e data, sem o subtítulo.
	variant?: "default" | "featured" | "compact";
};

const CARD_SHELL =
	"group overflow-hidden border border-[rgba(14,18,20,0.08)] bg-white text-[#0e1214] text-numeric transition-[box-shadow,transform] duration-[350ms] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#24549c]/30";

export function BlogPostCard({ post, variant = "default" }: BlogPostCardProps) {
	if (variant === "featured") {
		return (
			<Link
				href={`/blog/${post.slug}`}
				className={`${CARD_SHELL} grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] rounded-[28px] hover:shadow-[0_30px_70px_-34px_rgba(16,24,40,0.35)]`}
			>
				<DataCover post={post} variant="featured" badge="Mais recente" />
				<div className="flex flex-col justify-center gap-4 p-7 sm:p-12">
					<p className="m-0 text-[13px] font-semibold text-[#24549c]">{post.categoryLabel}</p>
					<h3 className="m-0 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[36px]">{post.title}</h3>
					<p className="m-0 text-[17px] leading-[1.55] text-[#5b6a70] text-pretty sm:text-lg">{post.headline}</p>
					<div className="mt-4 flex items-center justify-between gap-4 border-t border-[#e3e8ea] pt-5">
						<span className="text-sm text-[#687a80]">
							<time dateTime={post.publishedAt}>{formatArticleDate(post.publishedAt)}</time> · {post.readingTime} de leitura
						</span>
						<span className="flex size-11 flex-none items-center justify-center rounded-full bg-[#0e1214] text-white transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
							<ArrowUpRight className="size-[18px]" aria-hidden />
						</span>
					</div>
				</div>
			</Link>
		);
	}

	const compact = variant === "compact";
	return (
		<Link href={`/blog/${post.slug}`} className={`${CARD_SHELL} flex flex-col rounded-3xl hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)]`}>
			<DataCover post={post} variant="card" />
			<div className="flex flex-1 flex-col gap-2.5 p-6">
				<h3 className="m-0 text-xl font-semibold leading-[1.25] tracking-[-0.02em] text-balance">{post.title}</h3>
				{compact ? null : <p className="m-0 line-clamp-3 flex-1 text-[15px] leading-[1.55] text-[#5b6a70]">{post.headline}</p>}
				<div
					className={`${compact ? "mt-auto" : "mt-3"} flex items-center justify-between gap-3 border-t border-[#eef1f2] pt-4 text-[13px] text-[#687a80]`}
				>
					<span>
						<time dateTime={post.publishedAt}>{formatArticleDate(post.publishedAt, "short")}</time> · {post.readingTime}
					</span>
					<ArrowUpRight
						className="size-[18px] flex-none text-[#8a979c] transition-[color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#0e1214]"
						aria-hidden
					/>
				</div>
			</div>
		</Link>
	);
}

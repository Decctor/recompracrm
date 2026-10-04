import type { BlogPost } from "@/app/_content/blog-posts";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BlogPostCard } from "./BlogPostCard";

type RelatedPostsProps = {
	posts: BlogPost[];
};

export function RelatedPosts({ posts }: RelatedPostsProps) {
	if (posts.length === 0) return null;

	return (
		<section className="bg-slate-50 px-4 py-16 sm:px-6 sm:py-20">
			<div className="container mx-auto max-w-5xl">
				<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="mb-2 text-label text-[#24549C]">Continue lendo</p>
						<h2 className="text-2xl font-extrabold tracking-[-0.015em] text-slate-900 sm:text-[28px]">Leia também</h2>
					</div>
					<Link href="/blog" className="flex items-center gap-1 text-sm font-bold text-[#24549C] hover:underline">
						Ver todos os artigos
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				</div>
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{posts.map((post) => (
						<BlogPostCard key={post.slug} post={post} />
					))}
				</div>
			</div>
		</section>
	);
}

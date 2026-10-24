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
		<section aria-labelledby="leia-tambem" className="pb-24 sm:pb-[120px]">
			<div className="mx-auto max-w-[1240px] px-6">
				<div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-t border-[#e3e8ea] pt-14">
					<h2 id="leia-tambem" className="m-0 text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0e1214] sm:text-[40px]">
						Leia também
					</h2>
					<Link href="/blog#artigos" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#0e1214] hover:text-[#24549c]">
						Ver todos os artigos
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				</div>
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6">
					{posts.map((post) => (
						<BlogPostCard key={post.slug} post={post} variant="compact" />
					))}
				</div>
			</div>
		</section>
	);
}

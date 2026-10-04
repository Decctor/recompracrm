import { BLOG_POSTS, getBlogPost } from "@/app/_content/blog-posts";
import { CONTENT_OG_SIZE, renderContentOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Artigo do blog RecompraCRM";

export function generateStaticParams() {
	return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export default async function BlogPostOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const post = getBlogPost(slug);
	if (!post) notFound();
	return renderContentOgImage({ eyebrow: post.categoryLabel, title: post.title, cover: post.cover, footer: "recompracrm.com.br/blog" });
}

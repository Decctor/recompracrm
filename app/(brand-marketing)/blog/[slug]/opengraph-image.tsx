import { BLOG_POSTS, getBlogPost } from "@/app/_content/blog-posts";
import { COVER_OG_PANELS, resolveCover } from "@/components/Content/DataCover";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Artigo do blog RecompraCRM";

export function generateStaticParams() {
	return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

// A mesma capa de dados do artigo no site: o número, o rótulo, a fonte e a cor da categoria.
export default async function BlogPostOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const post = getBlogPost(slug);
	if (!post) notFound();
	const cover = resolveCover(post);
	return renderStatOgImage({
		eyebrow: post.categoryLabel,
		title: post.title,
		stat: cover.stat,
		statLabel: cover.label,
		statSource: cover.source,
		footer: "recompracrm.com.br/blog",
		panel: COVER_OG_PANELS[post.category],
	});
}

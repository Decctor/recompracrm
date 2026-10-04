import { BLOG_POSTS, getBlogPost } from "@/app/_content/blog-posts";
import { ArticleCTA } from "@/components/Content/ArticleCTA";
import { ArticleFAQ, buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { ArticleHero } from "@/components/Content/ArticleHero";
import { ArticleOutline } from "@/components/Content/ArticleOutline";
import { ArticleSection, getArticleOutline } from "@/components/Content/ArticleSection";
import { ArticleSources } from "@/components/Content/ArticleSources";
import { RelatedPosts } from "@/components/Content/RelatedPosts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
	params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
	return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = getBlogPost(slug);
	if (!post) return {};

	const canonicalUrl = `https://www.recompracrm.com.br/blog/${post.slug}`;

	return {
		title: post.title,
		description: post.description,
		keywords: post.seo.keywords,
		alternates: { canonical: canonicalUrl },
		openGraph: {
			title: post.title,
			description: post.description,
			url: canonicalUrl,
			type: "article",
			publishedTime: post.publishedAt,
			images: post.coverImage ? [{ url: post.coverImage.src, alt: post.coverImage.alt }] : undefined,
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
			images: post.coverImage ? [post.coverImage.src] : undefined,
		},
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = getBlogPost(slug);
	if (!post) notFound();

	const relatedPosts = BLOG_POSTS.filter((p) => post.relatedSlugs.includes(p.slug));

	const canonicalUrl = `https://www.recompracrm.com.br/blog/${post.slug}`;
	const authorName = post.author ?? "Equipe RecompraCRM";

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: post.title,
		description: post.description,
		datePublished: post.publishedAt,
		dateModified: post.updatedAt ?? post.publishedAt,
		author: {
			"@type": "Organization",
			name: authorName,
			url: "https://www.recompracrm.com.br",
		},
		publisher: {
			"@type": "Organization",
			name: "RecompraCRM",
			url: "https://www.recompracrm.com.br",
			logo: {
				"@type": "ImageObject",
				url: "https://www.recompracrm.com.br/logo.png",
			},
		},
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": canonicalUrl,
		},
		image: post.coverImage?.src,
		citation: post.sources?.map((source) => source.url),
		keywords: post.seo.keywords.join(", "),
	};

	const faqJsonLd = post.faqs && post.faqs.length > 0 ? buildFAQPageJsonLd(post.faqs) : null;

	return (
		<>
			{/* JSON-LD */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			<ArticleHero
				cover={post.cover}
				coverLabel={post.headline}
				categoryLabel={post.categoryLabel}
				categoryHref={`/blog?categoria=${post.category}`}
				title={post.title}
				description={post.description}
				author={authorName}
				publishedAt={post.publishedAt}
				updatedAt={post.updatedAt}
				readingTime={post.readingTime}
			/>

			<div className="px-4 pb-16 sm:px-6">
				<div className="container mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,680px)_200px] lg:justify-between lg:gap-12">
					<article className="min-w-0">
						{post.sections.map((section, i) => (
							<ArticleSection key={`${section.type}-${i}`} section={section} />
						))}

						<ArticleCTA headline={post.cta.headline} sub={post.cta.sub} buttonText={post.cta.buttonText} whatsappMessage={post.cta.whatsappMessage} />

						{post.faqs && post.faqs.length > 0 && <ArticleFAQ faqs={post.faqs} />}

						{post.sources && <ArticleSources sources={post.sources} />}
					</article>

					<aside className="hidden lg:block">
						<ArticleOutline items={getArticleOutline(post.sections)} />
					</aside>
				</div>
			</div>

			<RelatedPosts posts={relatedPosts} />
		</>
	);
}

import { Dock } from "@/app/_components/Dock";
import { BLOG_POSTS, getBlogPost } from "@/app/_content/blog-posts";
import { ArticleCTA } from "@/components/Content/ArticleCTA";
import { ArticleFAQ, buildFAQPageJsonLd } from "@/components/Content/ArticleFAQ";
import { ArticleHero } from "@/components/Content/ArticleHero";
import { ArticleOutline } from "@/components/Content/ArticleOutline";
import { ArticleSection, getArticleOutline } from "@/components/Content/ArticleSection";
import { ArticleSources } from "@/components/Content/ArticleSources";
import { headingAnchor } from "@/components/Content/article-text";
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
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
		},
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = getBlogPost(slug);
	if (!post) notFound();

	// Na ordem em que o artigo lista os relacionados.
	const relatedPosts = post.relatedSlugs.flatMap((s) => BLOG_POSTS.filter((p) => p.slug === s));

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
		citation: post.sources?.map((source) => source.url),
		keywords: post.seo.keywords.join(", "),
	};

	const faqJsonLd = post.faqs && post.faqs.length > 0 ? buildFAQPageJsonLd(post.faqs) : null;

	// O sumário termina nas perguntas frequentes, como no design.
	const outline = getArticleOutline(post.sections);
	if (post.faqs && post.faqs.length > 0) outline.push({ id: headingAnchor("Perguntas frequentes"), label: "Perguntas frequentes" });

	return (
		<>
			{/* JSON-LD */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			{faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}

			<Dock variant="artigo" />

			<ArticleHero
				cover={post.cover}
				category={post.category}
				categoryLabel={post.categoryLabel}
				categoryHref={`/blog?categoria=${post.category}#artigos`}
				title={post.title}
				description={post.description}
				author={authorName}
				publishedAt={post.publishedAt}
				updatedAt={post.updatedAt}
				readingTime={post.readingTime}
			/>

			{/* Coluna do texto com 700px no máximo; a partir de 1100px o sumário "Neste artigo" ocupa 220px à direita. */}
			<div className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)] items-start gap-20 px-6 pt-16 pb-24 sm:pt-20 sm:pb-[120px] min-[1100px]:grid-cols-[minmax(0,1fr)_220px]">
				<article data-article="" className="w-full min-w-0 max-w-[700px] justify-self-center text-numeric">
					{post.sections.map((section, i) => (
						<ArticleSection key={`${section.type}-${i}`} section={section} />
					))}

					<ArticleCTA headline={post.cta.headline} sub={post.cta.sub} buttonText={post.cta.buttonText} whatsappMessage={post.cta.whatsappMessage} />

					{post.faqs && post.faqs.length > 0 && <ArticleFAQ faqs={post.faqs} />}

					{post.sources && <ArticleSources sources={post.sources} />}
				</article>

				<aside className="sticky top-28 hidden min-[1100px]:block">
					<ArticleOutline items={outline} />
				</aside>
			</div>

			<RelatedPosts posts={relatedPosts} />
		</>
	);
}

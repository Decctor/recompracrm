import { Dock } from "@/app/_components/Dock";
import { BLOG_POSTS } from "@/app/_content/blog-posts";
import { BlogPostCard } from "@/components/Content/BlogPostCard";
import { BlogPostGrid, BlogPostGridView } from "@/components/Content/BlogPostGrid";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Blog — Estratégias de retenção para o varejo",
	description:
		"Guias práticos e dados verificados para donos de lojas físicas que querem fazer o cliente voltar: datas do varejo, custos do WhatsApp, cashback, segmentação RFM e mais.",
	alternates: {
		canonical: "https://www.recompracrm.com.br/blog",
	},
	openGraph: {
		title: "Blog RecompraCRM — Estratégias de retenção para o varejo",
		description: "Guias práticos e dados verificados para donos de lojas físicas que querem fazer o cliente voltar.",
		url: "https://www.recompracrm.com.br/blog",
		type: "website",
	},
};

const CONTAINER = "mx-auto max-w-[1240px] px-6";

export default function BlogIndexPage() {
	const posts = [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
	const featured = posts[0];

	return (
		<>
			<Dock variant="blog" />
			<main className="text-numeric">
				<section id="top" className="pt-32 pb-14 sm:pt-[168px] sm:pb-[72px]">
					<div className={CONTAINER}>
						<p className="m-0 mb-5 text-[13px] font-semibold text-[#24549c]">Blog RecompraCRM</p>
						<h1 className="m-0 max-w-[920px] text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-[52px] lg:text-[64px]">
							Ideias com dados para o cliente <span className="text-[#8a979c]">voltar à sua loja</span>
						</h1>
						<p className="m-0 mt-6 max-w-[640px] text-[17px] leading-[1.55] text-[#5b6a70] text-pretty sm:text-[19px]">
							Guias práticos para o varejo físico, com números checados e fonte em cada dado. Sem receita de bolo, sem estatística inventada.
						</p>
					</div>
				</section>

				{posts.length === 0 ? (
					<section className="pb-24 sm:pb-[120px]">
						<p className={`${CONTAINER} text-lg font-medium text-[#8a979c]`}>Novos artigos em breve.</p>
					</section>
				) : (
					<>
						{featured ? (
							<section aria-label="Artigo em destaque" className="pb-24 sm:pb-[120px]">
								<div className={CONTAINER}>
									<BlogPostCard post={featured} variant="featured" />
								</div>
							</section>
						) : null}

						{posts.length > 1 ? (
							<section id="artigos" className="scroll-mt-24 pb-24 sm:pb-[120px]">
								<div className={CONTAINER}>
									<Suspense fallback={<BlogPostGridView posts={posts} featuredSlug={featured?.slug} active={null} />}>
										<BlogPostGrid posts={posts} featuredSlug={featured?.slug} />
									</Suspense>
								</div>
							</section>
						) : null}
					</>
				)}

				<section className="pb-24 sm:pb-[120px]">
					<div className={CONTAINER}>
						<div className="flex flex-wrap items-center justify-between gap-x-12 gap-y-6 rounded-[28px] bg-[#eef2f6] p-7 sm:p-12">
							<div className="max-w-[620px]">
								<h2 className="m-0 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[32px]">Procurando o seu segmento?</h2>
								<p className="m-0 mt-3 text-[17px] leading-[1.6] text-[#5b6a70]">
									Veja como o programa de fidelidade funciona para restaurantes, pet shops, farmácias, moda e mais de 20 tipos de loja.
								</p>
							</div>
							<Link
								href="/segmentos"
								className="inline-flex h-[46px] items-center gap-2 whitespace-nowrap rounded-full bg-[#0e1214] px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-[#24549c]"
							>
								Ver segmentos
								<ArrowRight className="size-4" aria-hidden />
							</Link>
						</div>
					</div>
				</section>
			</main>
		</>
	);
}

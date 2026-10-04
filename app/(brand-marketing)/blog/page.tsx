import { BLOG_POSTS } from "@/app/_content/blog-posts";
import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { BlogPostCard } from "@/components/Content/BlogPostCard";
import { BlogPostGrid, BlogPostGridView } from "@/components/Content/BlogPostGrid";
import { FeatureCard } from "@/components/Content/FeatureCard";
import { IsoIcon } from "@/components/Illustrations/Isometric/IsoIcon";
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

export default function BlogIndexPage() {
	const posts = [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
	const featured = posts[0];

	return (
		<main className="px-4 pt-28 pb-20 sm:px-6">
			<div className="container mx-auto max-w-6xl">
				<header className="mb-12 max-w-3xl sm:mb-16">
					<p className="mb-4 text-label text-[#24549C]">Blog RecompraCRM</p>
					<h1 className="mb-5 text-[40px] font-extrabold leading-[1.02] tracking-[-0.025em] text-slate-900 text-balance sm:text-6xl">
						Ideias com dados para o cliente <span className="text-[#24549C]">voltar à sua loja</span>
					</h1>
					<p className="text-lg font-medium leading-[1.5] text-slate-500 sm:text-xl">
						Guias práticos para o varejo físico, com números checados e fonte em cada dado. Sem receita de bolo, sem estatística inventada.
					</p>
				</header>

				{posts.length === 0 ? (
					<div className="py-20 text-center text-slate-400">
						<p className="text-lg font-medium">Novos artigos em breve.</p>
					</div>
				) : (
					<>
						{featured && (
							<section className="mb-16" aria-label="Artigo em destaque">
								<BlogPostCard post={featured} variant="featured" />
							</section>
						)}

						{posts.length > 1 && (
							<section id="artigos" className="mb-20 scroll-mt-24">
								<h2 className="mb-6 text-2xl font-extrabold tracking-[-0.015em] text-slate-900 sm:text-[28px]">Todos os artigos</h2>
								<Suspense fallback={<BlogPostGridView posts={posts} featuredSlug={featured?.slug} active={null} />}>
									<BlogPostGrid posts={posts} featuredSlug={featured?.slug} />
								</Suspense>
							</section>
						)}
					</>
				)}

				<section className="mb-20 grid items-center gap-6 overflow-hidden rounded-[26px] bg-[#eef3fb] p-7 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:p-10">
					<IsoIcon icon="store" className="hidden w-40 sm:block" />
					<div>
						<h2 className="mb-2 text-xl font-extrabold tracking-[-0.015em] text-slate-900 sm:text-2xl">Procurando o seu segmento?</h2>
						<p className="max-w-xl leading-relaxed text-slate-600">
							Veja como o programa de fidelidade funciona para restaurantes, pet shops, farmácias, moda e mais de 20 tipos de loja.
						</p>
					</div>
					<Link
						href="/segmentos"
						className="inline-flex h-12 w-fit items-center gap-2 whitespace-nowrap rounded-2xl bg-[#24549C] px-6 text-[15px] font-extrabold text-white shadow-[0_6px_14px_-4px_rgba(36,84,156,0.32),0_2px_4px_rgba(36,84,156,0.18)] transition-[transform,background-color] duration-300 hover:-translate-y-px hover:bg-[#1a3d7a]"
					>
						Ver segmentos
						<ArrowRight className="size-4" aria-hidden />
					</Link>
				</section>

				{FEATURE_PAGES.length > 0 && (
					<section>
						<p className="mb-2 text-label text-[#24549C]">Produto</p>
						<h2 className="mb-8 text-2xl font-extrabold tracking-[-0.015em] text-slate-900 sm:text-[28px]">Conheça as funcionalidades</h2>
						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
							{FEATURE_PAGES.map((feature) => (
								<FeatureCard key={feature.slug} feature={feature} />
							))}
						</div>
					</section>
				)}
			</div>
		</main>
	);
}

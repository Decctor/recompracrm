import type { BlogCategory, BlogCover } from "@/app/_content/blog-posts";
import { BrandLogo } from "@/components/Brand/BrandLogo";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatArticleDate } from "./article-dates";
import { DataCover } from "./DataCover";

type ArticleHeroProps = {
	cover?: BlogCover;
	category: BlogCategory;
	categoryLabel: string;
	categoryHref: string;
	title: string;
	description: string;
	author: string;
	publishedAt?: string;
	updatedAt?: string;
	readingTime: string;
};

function Dot() {
	return <span aria-hidden className="size-1 rounded-full bg-[#c9d1d4]" />;
}

export function ArticleHero({
	cover,
	category,
	categoryLabel,
	categoryHref,
	title,
	description,
	author,
	publishedAt,
	updatedAt,
	readingTime,
}: ArticleHeroProps) {
	return (
		<header className="pt-32 sm:pt-40">
			<div className="mx-auto max-w-[1240px] px-6">
				<nav aria-label="Trilha" className="mb-8 flex items-center gap-2 text-sm">
					<Link href="/blog" className="font-medium text-[#0e1214] hover:text-[#24549c]">
						Blog
					</Link>
					<ChevronRight className="size-3.5 text-[#c9d1d4]" aria-hidden />
					<Link href={categoryHref} className="text-[#687a80] transition-colors hover:text-[#24549c]">
						{categoryLabel}
					</Link>
				</nav>

				<h1 className="m-0 max-w-[900px] text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-balance sm:text-[48px] lg:text-[58px] lg:leading-[1.03]">
					{title}
				</h1>
				<p className="m-0 mt-6 max-w-[720px] text-lg leading-[1.55] text-[#5b6a70] text-pretty sm:text-xl">{description}</p>

				<div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2.5 text-sm text-[#687a80] text-numeric">
					<span className="inline-flex items-center gap-2.5 font-medium text-[#0e1214]">
						<BrandLogo lockup="icon-badge" tone="color" alt="" className="size-7 object-contain" />
						{author}
					</span>
					{publishedAt ? (
						<>
							<Dot />
							<time dateTime={publishedAt}>{formatArticleDate(publishedAt)}</time>
						</>
					) : null}
					<Dot />
					<span>{readingTime} de leitura</span>
					{updatedAt && updatedAt !== publishedAt ? (
						<span className="inline-flex h-[26px] items-center rounded-full bg-[#eef2f6] px-2.5 text-xs font-semibold text-[#24549c]">
							Atualizado em&nbsp;<time dateTime={updatedAt}>{formatArticleDate(updatedAt, "short")}</time>
						</span>
					) : null}
				</div>

				<DataCover post={{ category, categoryLabel, cover, readingTime }} variant="hero" className="mt-12" />
			</div>
		</header>
	);
}

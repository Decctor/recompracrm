import { IsoCover, type TIsoCoverKey } from "@/components/Illustrations/Isometric/IsoCover";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatArticleDate } from "./article-dates";

type ArticleHeroProps = {
	cover: TIsoCoverKey;
	coverLabel: string;
	categoryLabel: string;
	categoryHref: string;
	title: string;
	description: string;
	author: string;
	publishedAt?: string;
	updatedAt?: string;
	readingTime?: string;
};

export function ArticleHero({ cover, coverLabel, categoryLabel, categoryHref, title, description, author, publishedAt, updatedAt, readingTime }: ArticleHeroProps) {
	return (
		<header className="px-4 pt-28 pb-12 sm:px-6 sm:pb-16">
			<div className="container mx-auto max-w-5xl">
				<nav aria-label="Trilha" className="mb-8 flex items-center gap-1.5 text-sm">
					<Link href="/blog" className="font-semibold text-[#24549C] hover:underline">
						Blog
					</Link>
					<ChevronRight className="size-3.5 text-slate-300" aria-hidden />
					<Link href={categoryHref} className="text-slate-500 transition-colors hover:text-[#24549C]">
						{categoryLabel}
					</Link>
				</nav>

				<div className="max-w-3xl">
					<h1 className="mb-5 text-[34px] font-extrabold leading-[1.08] tracking-[-0.025em] text-slate-900 text-balance sm:text-5xl">{title}</h1>
					<p className="mb-8 text-lg font-medium leading-[1.5] text-slate-600 sm:text-xl">{description}</p>

					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
						<span className="font-semibold text-slate-900">{author}</span>
						{publishedAt && (
							<>
								<span aria-hidden className="size-1 rounded-full bg-slate-300" />
								<time dateTime={publishedAt}>{formatArticleDate(publishedAt)}</time>
							</>
						)}
						{readingTime && (
							<>
								<span aria-hidden className="size-1 rounded-full bg-slate-300" />
								<span>{readingTime} de leitura</span>
							</>
						)}
						{updatedAt && updatedAt !== publishedAt && (
							<span className="rounded-full bg-[#24549C]/10 px-3 py-1 text-xs font-bold text-[#24549C]">
								Atualizado em <time dateTime={updatedAt}>{formatArticleDate(updatedAt, "short")}</time>
							</span>
						)}
					</div>
				</div>

				<div className="mt-10 overflow-hidden rounded-[26px] border border-slate-200 sm:mt-12">
					<IsoCover scene={cover} label={coverLabel} className="block aspect-[16/10] w-full sm:aspect-[16/8]" />
				</div>
			</div>
		</header>
	);
}

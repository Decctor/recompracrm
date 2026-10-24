import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Funcionalidade do RecompraCRM";

export function generateStaticParams() {
	return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

// O número é o primeiro da faixa de dados da página, com o rótulo e a fonte de lá.
export default async function FeatureOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const page = FEATURE_PAGES.find((p) => p.slug === slug);
	if (!page) notFound();
	const stat = page.sections.find((section) => section.type === "stats")?.items[0];
	return renderStatOgImage({
		eyebrow: `Funcionalidade · ${page.shortName}`,
		title: page.headline,
		stat: stat?.value ?? page.shortName,
		statLabel: stat?.label ?? page.title,
		statSource: stat?.source ? `Fonte: ${stat.source}` : null,
		footer: "recompracrm.com.br",
	});
}

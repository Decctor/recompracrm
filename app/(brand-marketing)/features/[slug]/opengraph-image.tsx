import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { CONTENT_OG_SIZE, renderContentOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Funcionalidade do RecompraCRM";

export function generateStaticParams() {
	return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export default async function FeatureOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const page = FEATURE_PAGES.find((p) => p.slug === slug);
	if (!page) notFound();
	return renderContentOgImage({ eyebrow: "Funcionalidade", title: page.headline, cover: page.cover, footer: "recompracrm.com.br" });
}

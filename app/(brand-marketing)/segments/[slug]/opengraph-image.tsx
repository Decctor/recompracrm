import { SEGMENT_PAGES, getSegmentPage } from "@/app/_content/segment-pages";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Programa de fidelidade por segmento — RecompraCRM";

export function generateStaticParams() {
	return SEGMENT_PAGES.map((page) => ({ slug: page.slug }));
}

// O número é a configuração sugerida do segmento, a mesma da seção "Configuração sugerida".
export default async function SegmentOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const page = getSegmentPage(slug);
	if (!page) notFound();
	const config = page.suggestedConfig;
	return renderStatOgImage({
		eyebrow: `Segmento · ${page.name}`,
		title: page.tagline,
		stat: config.cashbackPercent,
		statLabel: `de cashback sugerido, com validade de ${config.expirationDays} dias`,
		statSource: `Limite de resgate: ${config.rescueLimit} da compra`,
		footer: "recompracrm.com.br/segments",
	});
}

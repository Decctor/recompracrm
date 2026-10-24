import { SEGMENT_PAGES } from "@/app/_content/segment-pages";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Programa de fidelidade por segmento — RecompraCRM";

export default async function SegmentsOpengraphImage() {
	return renderStatOgImage({
		eyebrow: "Segmentos",
		title: "Programa de fidelidade por segmento",
		stat: `${SEGMENT_PAGES.length} segmentos`,
		statLabel: "com cashback, validade e limite de resgate já ajustados ao tipo de loja",
		footer: "recompracrm.com.br/segments",
	});
}

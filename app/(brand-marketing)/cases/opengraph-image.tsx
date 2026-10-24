import { LANDING_CASES } from "@/app/_content/cases";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { caseMetricText } from "./_components/case-format";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Cases de clientes do RecompraCRM";

export default async function CasesOpengraphImage() {
	// O destaque é o primeiro número do primeiro case com demonstrativo.
	const featured = LANDING_CASES.find((c) => c.metrics.length > 0);
	const metric = featured?.metrics[0];
	return renderStatOgImage({
		eyebrow: "Cases de clientes",
		title: "Lojas que contam, em vídeo, o que mudou nas vendas",
		stat: metric ? caseMetricText(metric) : `${LANDING_CASES.length} cases`,
		statLabel: metric && featured ? `${metric.description} · ${featured.client.name}` : "de lojas que usam o RecompraCRM",
		footer: "recompracrm.com.br/cases",
	});
}

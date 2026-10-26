import { LANDING_CASES } from "@/app/_content/cases";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";
import { notFound } from "next/navigation";
import { caseMetricText, casePlace, caseTitle } from "../_components/case-format";

export const size = CONTENT_OG_SIZE;
export const contentType = "image/png";
export const alt = "Case de cliente do RecompraCRM";

export function generateStaticParams() {
	return LANDING_CASES.map((item) => ({ slug: item.id }));
}

export default async function CaseOpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const item = LANDING_CASES.find((c) => c.id === slug);
	if (!item) notFound();
	// O primeiro número do demonstrativo resume o case; case só de depoimento mostra o cliente.
	const metric = item.metrics[0];
	return renderStatOgImage({
		eyebrow: `Case · ${item.client.name}`,
		title: caseTitle(item),
		stat: metric ? caseMetricText(metric) : item.client.name,
		statLabel: metric ? [metric.label, item.period].filter(Boolean).join(" · ") : casePlace(item),
		footer: "recompracrm.com.br/cases",
	});
}

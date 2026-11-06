import { FEATURE_PAGES } from "@/app/_content/feature-pages";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "Programa de fidelidade para loja — RecompraCRM";

// O número é o primeiro da faixa de dados da página, o mesmo da página de cashback.
export default async function LoyaltyProgramOpengraphImage() {
	const stat = FEATURE_PAGES.find((page) => page.slug === "programa-de-cashback")?.sections.find((section) => section.type === "stats")?.items[0];
	return renderStatOgImage({
		eyebrow: "Programa de fidelidade",
		title: "Programa de fidelidade para loja, sem cartão e sem aplicativo.",
		stat: stat?.value ?? "Cashback",
		statLabel: stat?.label ?? "com validade, identificado pelo telefone no balcão",
		statSource: stat?.source ? `Fonte: ${stat.source}` : null,
		footer: "recompracrm.com.br",
	});
}

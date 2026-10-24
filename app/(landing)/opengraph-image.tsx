import { LANDING_CASES } from "@/app/_content/cases";
import { CONTENT_OG_SIZE, renderStatOgImage } from "@/lib/content/og-image";

// Fica no grupo (landing) para valer só para "/": na raiz de app/, o Next herdaria esta imagem em
// todas as rotas sem imagem própria.
export const contentType = "image/png";
export const size = CONTENT_OG_SIZE;
export const alt = "RecompraCRM — Fidelize quem compra. Recupere quem parou de comprar.";

export default async function LandingOpengraphImage() {
	// O número é o resultado do primeiro case com demonstrativo — prova real, não promessa.
	const featured = LANDING_CASES.find((c) => c.metrics.length > 0);
	const metric = featured?.metrics[0];
	const digits = metric?.decimals ?? 0;
	return renderStatOgImage({
		eyebrow: "CRM de recompra para o varejo",
		title: "Fidelize quem compra. Recupere quem parou de comprar.",
		stat: metric
			? `${metric.prefix ?? ""}${metric.value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${metric.suffix ?? ""}`
			: "15 dias",
		statLabel: metric && featured ? `${metric.description} · ${featured.client.name}` : "de teste grátis, sem cartão de crédito",
		statSource: featured?.period ?? null,
		footer: "recompracrm.com.br",
	});
}

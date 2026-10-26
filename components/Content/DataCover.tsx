import type { BlogCategory, BlogPost } from "@/app/_content/blog-posts";
import type { TStatOgPanel } from "@/lib/content/og-image";
import { cn } from "@/lib/utils";

// Capa de dados dos artigos: o número-chave em tipo grande, o rótulo e a fonte. Substitui as
// ilustrações isométricas. A cor segue a categoria — azul-noite para guias, azul-acinzentado claro
// para dados do varejo, creme para dicas de gestão —, então a grade fica legível de relance.
export const COVER_TONES: Record<BlogCategory, { surface: string; value: string; label: string; meta: string; rule: string }> = {
	guias: { surface: "bg-[#0b1628]", value: "text-white", label: "text-white/72", meta: "text-white/50", rule: "border-white/14" },
	dados: { surface: "bg-[#eef2f6]", value: "text-[#24549c]", label: "text-[#4b585d]", meta: "text-[#8a979c]", rule: "border-[rgba(14,18,20,0.08)]" },
	dicas: {
		surface: "bg-[#fff7e5]",
		value: "text-[#7a5117]",
		label: "text-[#7a5117]",
		meta: "text-[rgba(122,81,23,0.6)]",
		rule: "border-[rgba(122,81,23,0.14)]",
	},
};

// As mesmas cores em hex, para a imagem de compartilhamento do artigo (o satori não lê classes).
export const COVER_OG_PANELS: Record<BlogCategory, TStatOgPanel> = {
	guias: { background: "#0b1628", value: "#ffffff", label: "rgba(255,255,255,0.72)", meta: "rgba(255,255,255,0.5)", accent: "#ffb900" },
	dados: { background: "#eef2f6", value: "#24549c", label: "#4b585d", meta: "#8a979c", accent: "#24549c" },
	dicas: { background: "#fff7e5", value: "#7a5117", label: "#7a5117", meta: "rgba(122,81,23,0.6)", accent: "#7a5117" },
};

type TCoverPost = Pick<BlogPost, "category" | "categoryLabel" | "cover" | "readingTime">;

// Post sem `cover` não fica sem capa: mostra o tempo de leitura, que todo artigo tem.
export function resolveCover(post: TCoverPost) {
	if (post.cover)
		return { stat: post.cover.stat, label: post.cover.label, source: post.cover.source ? `Fonte: ${post.cover.source}` : "Dado do próprio artigo" };
	return { stat: post.readingTime, label: "de leitura", source: null };
}

// O número nunca quebra linha e precisa caber na largura da capa em qualquer tela: o tamanho é o
// do design, limitado por uma fração da largura do contêiner (cqw) que encolhe com valores longos
// ("R$ 0,035", "4 semanas").
function valueSize(value: string, maxPx: number) {
	const cqw = Math.min(22, 80 / (Math.max(value.length, 1) * 0.52));
	return `min(${maxPx}px, ${cqw.toFixed(1)}cqw)`;
}

type DataCoverProps = {
	post: TCoverPost;
	// card: grade de artigos · featured: destaque do índice · hero: topo do artigo
	variant: "card" | "featured" | "hero";
	badge?: string;
	className?: string;
};

export function DataCover({ post, variant, badge, className }: DataCoverProps) {
	const tone = COVER_TONES[post.category];
	const cover = resolveCover(post);

	if (variant === "hero") {
		return (
			<div
				className={cn(
					"@container flex min-h-[280px] flex-col justify-between gap-12 rounded-[28px] p-7 sm:min-h-[400px] sm:gap-16 sm:p-10",
					tone.surface,
					className,
				)}
			>
				<div className={cn("flex items-center justify-between gap-3 text-[13px] font-semibold", tone.meta)}>
					<span>{post.categoryLabel}</span>
					{cover.source ? <span className="text-right">{cover.source}</span> : null}
				</div>
				<div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
					<p
						className={cn("m-0 whitespace-nowrap font-medium leading-[0.85] tracking-[-0.06em] text-numeric", tone.value)}
						style={{ fontSize: valueSize(cover.stat, 168) }}
					>
						{cover.stat}
					</p>
					<p className={cn("m-0 max-w-[30ch] text-lg leading-[1.4] sm:text-[22px]", tone.label)}>{cover.label}</p>
				</div>
			</div>
		);
	}

	const featured = variant === "featured";
	return (
		<div
			className={cn(
				"@container flex flex-col justify-between",
				featured ? "min-h-[360px] gap-10 p-7 sm:min-h-[440px] sm:p-10" : "aspect-[16/10] gap-6 p-6",
				tone.surface,
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<span className={cn("font-semibold", featured ? "text-[13px]" : "text-xs", tone.meta)}>{post.categoryLabel}</span>
				{badge ? (
					<span className="inline-flex h-[26px] items-center rounded-full bg-[#ffb900] px-2.5 text-xs font-semibold text-[#171717]">{badge}</span>
				) : null}
			</div>
			<div>
				<p
					className={cn("m-0 whitespace-nowrap font-medium leading-[0.95] tracking-[-0.05em] text-numeric", tone.value)}
					style={{ fontSize: valueSize(cover.stat, featured ? 120 : 56) }}
				>
					{cover.stat}
				</p>
				<p
					className={cn("m-0 leading-[1.4]", featured ? "mt-[18px] max-w-[30ch] text-[17px] sm:text-[19px]" : "mt-2.5 max-w-[32ch] text-sm", tone.label)}
				>
					{cover.label}
				</p>
				{featured && cover.source ? <p className={cn("m-0 mt-4 border-t pt-3.5 text-xs", tone.rule, tone.meta)}>{cover.source}</p> : null}
			</div>
		</div>
	);
}

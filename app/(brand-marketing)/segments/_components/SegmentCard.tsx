import type { SegmentPage } from "@/app/_content/segment-pages";
import Image from "next/image";
import Link from "next/link";
import { lightSurface, SEGMENT_FAMILY_THEMES, segmentHref, segmentIllustration } from "./segment-families";

type SegmentCardProps = {
	segment: SegmentPage;
	/** `hub`: resumo e três pílulas. `related`: nome da família no lugar do resumo e duas pílulas. */
	variant?: "hub" | "related";
};

// Cartão de segmento: ilustração isométrica sobre o fundo da família, nome e a configuração
// sugerida em pílulas.
export function SegmentCard({ segment, variant = "hub" }: SegmentCardProps) {
	const theme = SEGMENT_FAMILY_THEMES[segment.family];
	const config = segment.suggestedConfig;
	const pills = [`${config.cashbackPercent} cashback`, `${config.expirationDays} dias`];
	if (variant === "hub") pills.push(`${config.rescueLimit} por compra`);

	return (
		<Link
			href={segmentHref(segment.slug)}
			className="flex min-h-[176px] flex-col gap-2 rounded-[20px] border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_-28px_rgba(16,24,40,0.4)]"
		>
			<span className="-mx-2 -mt-2 mb-1.5 flex h-[132px] items-center justify-center rounded-[14px]" style={{ background: lightSurface(theme) }}>
				<span className="relative h-full w-[78%]">
					<Image src={segmentIllustration(segment.slug)} alt="" fill unoptimized className="object-contain" />
				</span>
			</span>
			{variant === "related" ? <span className="text-[12px] font-semibold text-[#687a80]">{theme.label}</span> : null}
			<span className="text-[18px] font-semibold tracking-[-0.015em]">{segment.name}</span>
			{variant === "hub" ? <span className="line-clamp-2 text-[13px] leading-[1.5] text-[#5b6a70]">{segment.heroSubtitle}</span> : null}
			<span className="mt-auto flex flex-wrap gap-1.5 pt-3.5">
				{pills.map((pill) => (
					<span
						key={pill}
						className="inline-flex h-6 items-center rounded-full px-[9px] text-[11.5px] font-semibold whitespace-nowrap"
						style={theme.dark ? { background: "#0e1214", color: "#fff" } : { background: theme.bg, color: theme.accent }}
					>
						{pill}
					</span>
				))}
			</span>
		</Link>
	);
}

import type { TCaseMetric, TLandingCase } from "@/app/_content/cases";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { caseMetricParts } from "./case-format";

const LOGO_SIZE = { sm: "h-11 w-11 p-1.5", md: "h-12 w-12 p-1.5", lg: "h-16 w-16 p-2" } as const;
const LOGO_PIXELS = { sm: 44, md: 48, lg: 64 } as const;

/** Logo do cliente num círculo branco; sem logo, as iniciais. */
export function CaseLogo({ item, size, decorative = false }: { item: TLandingCase; size: keyof typeof LOGO_SIZE; decorative?: boolean }) {
	return (
		<span className={cn("flex flex-none items-center justify-center overflow-hidden rounded-full border border-[#e3e8ea] bg-white", LOGO_SIZE[size])}>
			{item.client.logoSrc ? (
				<Image
					src={item.client.logoSrc}
					alt={decorative ? "" : `Logo ${item.client.name}`}
					width={LOGO_PIXELS[size]}
					height={LOGO_PIXELS[size]}
					className="h-full w-full object-contain"
				/>
			) : (
				<span className="text-[13px] font-bold text-[#24549c]" aria-hidden={decorative || undefined}>
					{item.client.name.slice(0, 2).toUpperCase()}
				</span>
			)}
		</span>
	);
}

const METRIC_SIZE = {
	card: {
		root: "gap-[3px] text-[36px] leading-none tracking-[-0.045em]",
		prefix: "text-[20px] tracking-[-0.02em]",
		unit: "text-[15px] tracking-normal",
	},
	hero: {
		root: "gap-1 text-[64px] leading-[0.9] tracking-[-0.055em] sm:text-[88px]",
		prefix: "text-[30px] tracking-[-0.03em] sm:text-[40px]",
		unit: "text-[20px] tracking-[-0.01em] sm:text-[24px]",
	},
} as const;

/** Valor de uma métrica: prefixo e unidade menores, o número em destaque. */
export function CaseMetricValue({ metric, size }: { metric: TCaseMetric; size: keyof typeof METRIC_SIZE }) {
	const parts = caseMetricParts(metric);
	const s = METRIC_SIZE[size];
	return (
		<span className={cn("flex items-baseline font-medium whitespace-nowrap", s.root)}>
			{parts.prefix ? <span className={s.prefix}>{parts.prefix}</span> : null}
			{parts.value}
			{parts.unit ? <span className={cn("text-[#687a80]", s.unit)}>{parts.unit}</span> : null}
		</span>
	);
}

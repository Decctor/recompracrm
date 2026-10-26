import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

// Peças de layout repetidas em todas as seções da landing.

export function Container({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("mx-auto max-w-[1240px] px-6", className)}>{children}</div>;
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
	return <p className={cn("mb-4 text-[13px] font-semibold text-[#24549c]", className)}>{children}</p>;
}

export function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
	return <h2 className={cn("text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[48px]", className)}>{children}</h2>;
}

export function SectionLead({ className, children }: { className?: string; children: ReactNode }) {
	return <p className={cn("mt-[18px] text-[17px] leading-[1.6] text-pretty text-[#5b6a70]", className)}>{children}</p>;
}

/** Painel cinza-azulado (28px de raio) que apoia texto + recorte de produto lado a lado. */
export function Stage({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div
			className={cn(
				"grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-12 rounded-[28px] bg-[#eef2f6] p-6 sm:p-14",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** Moldura branca com sombra longa dos recortes de produto. */
export function MockCard({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
	return (
		<ul className={cn("mt-6 flex flex-col gap-3", className)}>
			{items.map((item) => (
				<li key={item} className="flex gap-3 text-[15px] leading-[1.5] text-[#262626]">
					<Check className="mt-[3px] h-4 w-4 shrink-0 text-[#24549c]" strokeWidth={2.25} aria-hidden />
					{item}
				</li>
			))}
		</ul>
	);
}

/** Número do passo (32px, borda clara). */
export function StepNumber({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e3e8ea] text-[13px] font-bold text-[#24549c]">
			{children}
		</span>
	);
}

/** Marcador azul sólido dos blocos "1 Pontuar" / "2 Resgatar". */
export function PhaseBadge({ children }: { children: ReactNode }) {
	return <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#24549c] text-[13px] font-bold text-white">{children}</span>;
}

/** Rótulo pequeno em caixa alta usado dentro dos recortes de produto. */
export function MockLabel({ className, children }: { className?: string; children: ReactNode }) {
	return <p className={cn("text-[11px] font-semibold tracking-[0.04em] text-[#687a80] uppercase", className)}>{children}</p>;
}

export const PILL_BUTTON =
	"inline-flex h-[46px] flex-none items-center gap-2 rounded-full px-[22px] text-[15px] font-medium whitespace-nowrap transition-colors";

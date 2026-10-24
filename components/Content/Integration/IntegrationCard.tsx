import type { IntegrationPage } from "@/app/_content/integration-pages";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type IntegrationCardProps = {
	integration: IntegrationPage;
	// `default`: cartão alto do hub (logo, categoria, chamada, resumo da conexão).
	// `compact`: linha de "Outras integrações" (logo, nome, categoria).
	variant?: "default" | "compact";
};

export function IntegrationCard({ integration, variant = "default" }: IntegrationCardProps) {
	const href = `/integrations/${integration.slug}`;

	if (variant === "compact") {
		return (
			<Link
				href={href}
				className="group flex items-center gap-4 rounded-[20px] border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] transition-shadow duration-300 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)]"
			>
				<IntegrationLogo integration={integration} className="size-[52px] p-2.5" />
				<span className="min-w-0 flex-1">
					<span className="block text-[17px] font-semibold leading-[normal]">{integration.name}</span>
					<span className="mt-0.5 block text-[13px] leading-[normal] text-[#687a80]">{integration.category}</span>
				</span>
				<ArrowUpRight
					className="size-[18px] flex-none text-[#8a979c] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
					aria-hidden
				/>
			</Link>
		);
	}

	return (
		<Link
			href={href}
			className="group flex min-h-[260px] flex-col gap-5 rounded-3xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-30px_rgba(16,24,40,0.35)] sm:min-h-[300px] sm:p-7"
		>
			<div className="flex items-center justify-between gap-3">
				<IntegrationLogo integration={integration} className="size-14 p-[11px]" />
				<CategoryChip>{integration.category}</CategoryChip>
			</div>
			<div>
				<h3 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-2xl">{integration.name}</h3>
				<p className="m-0 mt-2 text-base leading-[1.5] text-[#5b6a70] text-pretty">{integration.tagline}</p>
			</div>
			<div className="mt-auto flex items-center justify-between gap-3 border-t border-[#eef1f2] pt-4">
				<span className="text-[13px] leading-[1.4] text-[#687a80]">{integration.connectionSummary}</span>
				<ArrowUpRight
					className="size-[18px] flex-none text-[#8a979c] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
					aria-hidden
				/>
			</div>
		</Link>
	);
}

/** Logo do parceiro num círculo branco com borda clara. O tamanho e o respiro vêm do `className`. */
export function IntegrationLogo({
	integration,
	className,
	decorative = false,
}: {
	integration: IntegrationPage;
	className?: string;
	decorative?: boolean;
}) {
	return (
		<span className={cn("flex flex-none items-center justify-center rounded-full border border-[#e3e8ea] bg-white", className)}>
			<Image src={integration.logo} alt={decorative ? "" : integration.logoAlt} className="size-full object-contain" sizes="72px" />
		</span>
	);
}

export function CategoryChip({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-[#f2f4f4] px-2.5 text-xs font-semibold leading-[normal] text-[#4b585d]">
			{children}
		</span>
	);
}

"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type TMetricToggleOption<T extends string> = { value: T; label: string; icon: LucideIcon };

/** Pílulas de métrica dos blocos (gráfico, ranking, insumos) — o mesmo desenho das estatísticas de campanha. */
export function MetricToggle<T extends string>({
	options,
	value,
	onChange,
	ariaLabel,
}: {
	options: TMetricToggleOption<T>[];
	value: T;
	onChange: (value: T) => void;
	ariaLabel: string;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1" role="group" aria-label={ariaLabel}>
			{options.map((option) => {
				const Icon = option.icon;
				const active = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(option.value)}
						className={cn(
							"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
							active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
						)}
					>
						<Icon className="size-3.5 min-h-3.5 min-w-3.5" />
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

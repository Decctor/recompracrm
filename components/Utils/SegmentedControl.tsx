"use client";

import { cn } from "@/lib/utils";

type SegmentedControlProps<T extends string | number> = {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	className?: string;
	"aria-label"?: string;
};

/** Seletor de poucas opções exclusivas (período, métrica) em pílulas sobre fundo neutro. */
export default function SegmentedControl<T extends string | number>({ value, options, onChange, className, ...props }: SegmentedControlProps<T>) {
	return (
		<div role="radiogroup" aria-label={props["aria-label"]} className={cn("bg-muted/70 flex w-fit items-center gap-1 rounded-[10px] p-1", className)}>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<button
						key={String(option.value)}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onChange(option.value)}
						className={cn(
							"cursor-pointer whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors",
							active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

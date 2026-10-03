"use client";

import { cn } from "@/lib/utils";

/** Opção Sim/Não do construtor (mesma linguagem das opções de peça do protótipo). */
export default function KitToggle({
	label,
	value,
	onChange,
	hint,
}: {
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	hint?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
			<span className="flex flex-col">
				<span className="text-xs font-medium">{label}</span>
				{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
			</span>
			<span className="flex shrink-0 items-center rounded-full bg-muted p-0.5">
				{[true, false].map((option) => (
					<button
						key={String(option)}
						type="button"
						onClick={() => onChange(option)}
						aria-pressed={value === option}
						className={cn(
							"rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
							value === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
						)}
					>
						{option ? "Sim" : "Não"}
					</button>
				))}
			</span>
		</div>
	);
}

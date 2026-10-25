"use client";

import { Minus, MoveDown, MoveUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent, getPercentChange } from "../finance-chart-kit";

/** Variação vs. período anterior; "SEM BASE" quando o anterior é zero. */
export function ChangeBadge({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
	const result = getPercentChange(current, previous, invert);
	if (!result)
		return (
			<span className="bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
				<Minus className="size-2.5" />
				SEM BASE
			</span>
		);
	const Icon = result.change >= 0 ? MoveUp : MoveDown;
	return (
		<span
			title="Variação em relação ao período imediatamente anterior de mesma duração"
			className={cn(
				"inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
				result.isGood ? "bg-[#eafaf0] text-green-700" : "bg-[#fdecec] text-red-700",
			)}
		>
			<Icon className="size-2.5" />
			{formatPercent(Math.abs(result.change))}
		</span>
	);
}

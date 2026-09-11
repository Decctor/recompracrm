"use client";

import { MoveDown, MoveUp } from "lucide-react";
import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type DeltaBadgeProps = {
	current: number;
	previous: number;
	/** Para métricas onde queda é positivo (custos, despesas). */
	invert?: boolean;
};
export function DeltaBadge({ current, previous, invert = false }: DeltaBadgeProps) {
	if (!previous) return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground uppercase">Sem base</span>;
	const percentChange = ((current - previous) / Math.abs(previous)) * 100;
	const isIncrease = percentChange >= 0;
	const isGood = invert ? percentChange <= 0 : percentChange >= 0;
	return (
		<span
			title="Variação em relação ao período imediatamente anterior de mesma duração"
			className={cn("text-numeric flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium", {
				"bg-green-500/10 text-green-700 dark:text-green-400": isGood,
				"bg-red-500/10 text-red-700 dark:text-red-400": !isGood,
			})}
		>
			{isIncrease ? <MoveUp className="h-2.5 w-2.5 min-w-2.5 min-h-2.5" /> : <MoveDown className="h-2.5 w-2.5 min-w-2.5 min-h-2.5" />}
			{formatDecimalPlaces(Math.abs(percentChange), 1, 1)}%
		</span>
	);
}

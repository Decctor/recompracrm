import type * as React from "react";

import { cn } from "@/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type StatBadgeProps = {
	icon: React.ReactNode;
	value: React.ReactNode;
	tooltipContent?: React.ReactNode;
	className?: string;
	valueClassName?: string;
	tooltipClassName?: string;
	tooltipContentClassName?: string;
};

export function StatBadge({ icon, value, tooltipContent, className, valueClassName, tooltipClassName, tooltipContentClassName }: StatBadgeProps) {
	const content = (
		<div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.65rem] bg-secondary text-primary", className)}>
			{icon}
			<p className={cn("text-xs font-medium tracking-tight uppercase", valueClassName)}>{value}</p>
		</div>
	);

	if (!tooltipContent) {
		return content;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent className={tooltipClassName}>
				<div className={cn(tooltipContentClassName)}>{tooltipContent}</div>
			</TooltipContent>
		</Tooltip>
	);
}

"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import type { ReactElement, ReactNode } from "react";

type HoverOrPopoverProps = {
	trigger: ReactElement;
	children: ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	sideOffset?: number;
	hoverOpenDelay?: number;
	hoverCloseDelay?: number;
	/** Use `false` when the trigger is not a native `<button>` (e.g. span, chip). */
	nativeButton?: boolean;
};

/**
 * Hover preview on pointer devices; popover on tap for viewports below 768px (no reliable hover).
 * Same split as CashbackTransactionCard Details — centralized so touch targets stay reachable.
 */
export function HoverOrPopover({
	trigger,
	children,
	className,
	align = "center",
	side = "bottom",
	sideOffset = 4,
	hoverOpenDelay = 200,
	hoverCloseDelay = 100,
	nativeButton = false,
}: HoverOrPopoverProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");

	if (!isDesktop) {
		return (
			<Popover>
				<PopoverTrigger nativeButton={nativeButton} render={trigger} />
				<PopoverContent align={align} side={side} sideOffset={sideOffset} className={className}>
					{children}
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<HoverCard>
			<HoverCardTrigger delay={hoverOpenDelay} closeDelay={hoverCloseDelay} render={trigger} />
			<HoverCardContent align={align} side={side} sideOffset={sideOffset} className={className}>
				{children}
			</HoverCardContent>
		</HoverCard>
	);
}

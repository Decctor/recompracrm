"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganizationSubscriptionStatus } from "@/lib/queries/organizations";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function SubscriptionStatusBanner() {
	const { data } = useOrganizationSubscriptionStatus();

	if (!data || data.modo === "success") return null;

	const isWarn = data.modo === "warn";
	const isFail = data.modo === "fail";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					href="/dashboard/settings?tab=subscription"
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200 hover:opacity-80 shrink-0",
						isWarn && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
						isFail && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
					)}
				>
					{isWarn && <AlertTriangle className="w-3.5 h-3.5" />}
					{isFail && <AlertCircle className="w-3.5 h-3.5" />}
					<span className="hidden sm:inline">{data.status}</span>
				</Link>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8} className="max-w-64">
				{data.mensagem}
			</TooltipContent>
		</Tooltip>
	);
}

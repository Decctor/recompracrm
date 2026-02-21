"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

export type TCommunityBreadcrumbItem = {
	label: string;
	href?: string;
};

type CommunityHeaderProps = {
	breadcrumbs?: TCommunityBreadcrumbItem[];
};

export function CommunityHeader({ breadcrumbs }: CommunityHeaderProps) {
	return (
		<header className="flex items-center gap-2 w-full">
			<SidebarTrigger />
			{breadcrumbs && breadcrumbs.length > 0 && (
				<nav className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
					{breadcrumbs.map((item, index) => {
						const isLast = index === breadcrumbs.length - 1;
						return (
							<Fragment key={`breadcrumb-${index.toString()}`}>
								{index > 0 && <ChevronRight className="w-3 h-3 min-w-3 min-h-3 shrink-0" />}
								{isLast || !item.href ? (
									<span className={`truncate max-w-[200px] ${isLast ? "text-foreground font-medium" : ""}`}>{item.label}</span>
								) : (
									<Link href={item.href} className="hover:text-foreground transition-colors truncate max-w-[200px]">
										{item.label}
									</Link>
								)}
							</Fragment>
						);
					})}
				</nav>
			)}
		</header>
	);
}

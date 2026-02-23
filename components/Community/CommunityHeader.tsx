"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import RecompraCRMLogoDark from "@/utils/svgs/logos/RECOMPRA - COMPLETE - HORIZONTAL- COLORFUL.svg";
import RecompraCRMLogoLight from "@/utils/svgs/logos/RECOMPRA - COMPLETE - HORIZONTAL- COLORFUL TEXT-BLACK.svg";
import { ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import Image from "next/image";
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
	const { theme } = useTheme();
	return (
		<header className="w-full flex-col flex items-center gap-2">
			<div className="w-36 block sm:hidden">
				<Image src={theme === "dark" ? RecompraCRMLogoDark : RecompraCRMLogoLight} alt="Logo RecompraCRM" className="w-full h-auto" />
			</div>
			<div className="w-full flex items-center gap-2">
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
			</div>
		</header>
	);
}

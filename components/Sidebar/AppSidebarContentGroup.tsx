"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { TSidebarConfigItem, TSidebarItem } from "./AppSidebar";

function isPathActive(pathname: string, url: string | null, activeMatch: "exact" | "prefix" = "prefix") {
	if (!url) return false;
	if (pathname === url) return true;
	if (activeMatch === "exact") return false;
	return pathname.startsWith(`${url}/`);
}

function AppSidebarContentGroup({ group }: { group: TSidebarConfigItem }) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>{group.group}</SidebarGroupLabel>
			<SidebarMenu>
				{group.items.map((item) => (
					<AppSidebarContentGroupItem key={item.id} item={item} />
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}

export default AppSidebarContentGroup;

function AppSidebarContentGroupItem({ item }: { item: TSidebarItem }) {
	const pathname = usePathname();
	const { state, setOpen } = useSidebar();
	const childIsActive = item.items?.some((subItem) => isPathActive(pathname, subItem.url, subItem.activeMatch)) ?? false;
	const itemIsActive = isPathActive(pathname, item.url, item.activeMatch);
	const routeIsActive = childIsActive || itemIsActive;
	const [isOpen, setIsOpen] = useState(routeIsActive);

	useEffect(() => {
		if (routeIsActive) setIsOpen(true);
	}, [routeIsActive]);

	if (item.items && item.items.length > 0) {
		return (
			<Collapsible asChild open={isOpen} onOpenChange={setIsOpen} className="group/collapsible">
				<SidebarMenuItem>
					<CollapsibleTrigger asChild>
						<SidebarMenuButton
							tooltip={item.title}
							isActive={childIsActive || itemIsActive}
							onClick={() => {
								if (state === "collapsed") setOpen(true);
							}}
						>
							{item.icon}
							<span>{item.title}</span>
							{/* A badge do pai e a do filho escondido: dois `ml-auto` irmaos dividiriam o espaco
							    livre entre si e jogariam a badge para o meio da linha, entao o empurrao para a
							    direita e do invólucro e nao de cada um. */}
							<div className="ml-auto flex shrink-0 items-center gap-1">
								{item.badge}
								<ChevronRight className="transition-transform duration-200 ease-out group-data-[state=open]/collapsible:rotate-90" />
							</div>
						</SidebarMenuButton>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<SidebarMenuSub>
							{item.items.map((subItem) => (
								<SidebarMenuSubItem key={subItem.id}>
									<SidebarMenuSubButton asChild isActive={isPathActive(pathname, subItem.url, subItem.activeMatch)}>
										{subItem.url ? (
											<Link href={subItem.url}>
												<span className="truncate">{subItem.title}</span>
												{subItem.badge}
											</Link>
										) : (
											<span>{subItem.title}</span>
										)}
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							))}
						</SidebarMenuSub>
					</CollapsibleContent>
				</SidebarMenuItem>
			</Collapsible>
		);
	}

	return (
		<SidebarMenuItem>
			<SidebarMenuButton tooltip={item.title} asChild isActive={itemIsActive}>
				{item.url ? (
					<Link href={item.url} aria-current={itemIsActive ? "page" : undefined}>
						{item.icon}
						<span>{item.title}</span>
						{item.badge}
					</Link>
				) : (
					<span>
						{item.icon}
						<span>{item.title}</span>
					</span>
				)}
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

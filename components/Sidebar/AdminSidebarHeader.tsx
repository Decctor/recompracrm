"use client";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import LogoIcon from "@/utils/images/logo-icon.png";
import { ArrowRightLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function AdminSidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem className="flex items-center justify-center">
				<div className="flex items-center gap-2 w-full self-center">
					<div className="relative w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 self-center rounded-lg overflow-hidden">
						<Image src={LogoIcon} alt="RecompraCRM" fill />
					</div>
					<div className="grid flex-1 text-left text-sm leading-tight">
						<span className="truncate font-medium">Painel Admin</span>
					</div>
				</div>
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarMenuButton asChild>
					<Link href="/dashboard">
						<ArrowRightLeft className="w-4 h-4 min-w-4 min-h-4" />
						<span>Dashboard</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

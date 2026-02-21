"use client";

import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import RecompraCRMLogo from "@/utils/svgs/logos/RECOMPRA - ICON - COLORFUL.svg";
import { GraduationCap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
export default function CommunitySidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<Link href="/community" className="flex items-center gap-2 w-full px-2 py-1">
					<div className="w-8 h-8 min-w-8 min-h-8 rounded-lg bg-[#24549C] flex items-center justify-center relative">
						<Image src={RecompraCRMLogo} alt="RecompraCRM Logo" fill />
					</div>
					<div className="grid flex-1 text-left text-sm leading-tight">
						<span className="truncate font-bold">RecompraFLIX</span>
					</div>
				</Link>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

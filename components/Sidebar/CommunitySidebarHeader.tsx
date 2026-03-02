"use client";

import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import RecompraCRMLogo from "@/utils/svgs/logos/RECOMPRA - ICON - COLORFUL.svg";
import Image from "next/image";
import Link from "next/link";
export default function CommunitySidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<Link href="/community" className="flex w-full items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
					<div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#24549C]">
						<Image src={RecompraCRMLogo} alt="RecompraCRM Logo" fill className="object-cover" />
					</div>
					<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
						<span className="truncate font-bold">RecompraFLIX</span>
					</div>
				</Link>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

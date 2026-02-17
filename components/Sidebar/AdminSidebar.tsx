"use client";

import { Shield, SquareKanban } from "lucide-react";
import AppSidebarContentGroup from "@/components/Sidebar/AppSidebarContentGroup";
import AppSidebarHeader from "@/components/Sidebar/AppSidebarHeader";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import type { TAuthUserSession } from "@/lib/authentication/types";
import AdminSidebarFooter from "./AdminSidebarFooter";
import type { TSidebarConfigItem } from "./AppSidebar";

const adminSidebarConfig: TSidebarConfigItem[] = [
	{
		group: "Administração",
		items: [
			{
				title: "Painel Admin",
				url: "/admin-dashboard",
				icon: <Shield className="w-4 h-4" />,
				items: null,
			},
		],
	},
	{
		group: "CRM",
		items: [
			{
				title: "CRM",
				url: "/admin-dashboard/crm",
				icon: <SquareKanban className="w-4 h-4" />,
				items: null,
			},
			{
				title: "Dashboard CRM",
				url: "/admin-dashboard/crm/dashboard",
				icon: <SquareKanban className="w-4 h-4" />,
				items: null,
			},
			{
				title: "Atividades CRM",
				url: "/admin-dashboard/crm/activities",
				icon: <SquareKanban className="w-4 h-4" />,
				items: null,
			},
		],
	},
];

type AdminSidebarProps = React.ComponentProps<typeof Sidebar> & {
	user: TAuthUserSession["user"];
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"] | null;
};

export function AdminSidebar({ user, organization, ...props }: AdminSidebarProps) {
	return (
		<Sidebar variant="inset" collapsible="icon" {...props}>
			<SidebarHeader>
				<AppSidebarHeader sessionUserOrg={organization} user={user} mode="admin" />
			</SidebarHeader>
			<SidebarContent>
				{adminSidebarConfig.map((group) => (
					<AppSidebarContentGroup key={group.group} group={group} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<AdminSidebarFooter user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

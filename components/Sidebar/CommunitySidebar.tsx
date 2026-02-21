"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { BookOpen, BookText, FileText, GraduationCap, Home } from "lucide-react";
import Link from "next/link";
import CommunitySidebarFooter from "./CommunitySidebarFooter";
import CommunitySidebarHeader from "./CommunitySidebarHeader";

type TCommunitySidebarItem = {
	title: string;
	url: string;
	icon: React.ReactNode;
};

const SIDEBAR_NAV: { group: string; items: TCommunitySidebarItem[] }[] = [
	{
		group: "Explorar",
		items: [
			{ title: "Início", url: "/community", icon: <Home className="w-4 h-4 min-w-4 min-h-4" /> },
			{ title: "Cursos", url: "/community/courses", icon: <BookOpen className="w-4 h-4 min-w-4 min-h-4" /> },
			{ title: "eBooks", url: "/community/ebooks", icon: <BookText className="w-4 h-4 min-w-4 min-h-4" /> },
			{ title: "Documentos", url: "/community/documents", icon: <FileText className="w-4 h-4 min-w-4 min-h-4" /> },
			{
				title: "Tutoriais",
				url: "/community/tutorials",
				icon: <GraduationCap className="w-4 h-4 min-w-4 min-h-4" />,
			},
		],
	},
];

type CommunitySidebarProps = React.ComponentProps<typeof Sidebar> & {
	user: {
		nome: string;
		email: string;
		avatarUrl?: string | null;
	} | null;
};

export function CommunitySidebar({ user, ...props }: CommunitySidebarProps) {
	return (
		<Sidebar variant="inset" collapsible="icon" {...props}>
			<SidebarHeader>
				<CommunitySidebarHeader />
			</SidebarHeader>
			<SidebarContent>
				{SIDEBAR_NAV.map((group) => (
					<SidebarGroup key={group.group}>
						<SidebarGroupLabel>{group.group}</SidebarGroupLabel>
						<SidebarMenu>
							{group.items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton tooltip={item.title} asChild>
										<Link href={item.url}>
											{item.icon}
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				<CommunitySidebarFooter user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

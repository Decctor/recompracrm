"use client";
import { ThemeToggle } from "@/components/Utils/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatNameAsInitials } from "@/lib/formatting";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import SubscriptionBadge from "./SubscriptionBadge";

export default function AppSidebarFooter({
	user,
	organization,
}: {
	user: TAuthUserSession["user"];
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
}) {
	const { isMobile } = useSidebar();

	return (
		<SidebarMenu>
			<SubscriptionBadge organization={organization} />

			<SidebarMenuItem>
				<ThemeToggle />
			</SidebarMenuItem>

			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
						>
							<Avatar className="h-8 w-8 shrink-0 rounded-lg">
								<AvatarImage src={user.avatarUrl ?? undefined} alt={user.nome} />
								<AvatarFallback className="rounded-lg">{formatNameAsInitials(user.nome)}</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
								<span className="truncate font-medium">{user.nome}</span>
								<span className="truncate text-xs">{user.email}</span>
							</div>
							<ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={user.avatarUrl ?? undefined} alt={user.nome} />
									<AvatarFallback className="rounded-lg">{formatNameAsInitials(user.nome)}</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.nome}</span>
									<span className="truncate text-xs">{user.email}</span>
								</div>
							</div>
						</DropdownMenuLabel>

						<DropdownMenuGroup>
							<DropdownMenuItem>
								<SidebarMenuButton asChild>
									<Link href="/dashboard/settings">
										<UserRound />
										Configurações
									</Link>
								</SidebarMenuButton>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							<SidebarMenuButton asChild>
								<Link href="/auth/logout" prefetch={false}>
									<LogOut />
									Sair
								</Link>
							</SidebarMenuButton>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

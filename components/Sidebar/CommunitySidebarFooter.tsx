"use client";

import { ThemeToggle } from "@/components/Utils/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { formatNameAsInitials } from "@/lib/formatting";
import { ChevronsUpDown, LogIn, LogOut } from "lucide-react";
import Link from "next/link";

type CommunitySidebarFooterProps = {
	user: {
		nome: string;
		email: string;
		avatarUrl?: string | null;
	} | null;
};

export default function CommunitySidebarFooter({ user }: CommunitySidebarFooterProps) {
	const { isMobile } = useSidebar();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<ThemeToggle />
			</SidebarMenuItem>

			{user ? (
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={user.avatarUrl ?? undefined} alt={user.nome} />
									<AvatarFallback className="rounded-lg">{formatNameAsInitials(user.nome)}</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.nome}</span>
									<span className="truncate text-xs">{user.email}</span>
								</div>
								<ChevronsUpDown className="ml-auto size-4" />
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
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link href="/dashboard">
									<span>Minha conta</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link href="/auth/logout" prefetch={false}>
									<LogOut className="w-4 h-4 min-w-4 min-h-4" />
									<span>Sair</span>
								</Link>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			) : (
				<SidebarMenuItem>
					<SidebarMenuButton asChild size="lg">
						<Link href="/auth/signin" className="flex items-center gap-2">
							<div className="w-8 h-8 min-w-8 min-h-8 rounded-lg bg-primary flex items-center justify-center">
								<LogIn className="w-4 h-4 min-w-4 min-h-4 text-primary-foreground" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">Entrar</span>
								<span className="truncate text-xs text-muted-foreground">Fazer login</span>
							</div>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			)}
		</SidebarMenu>
	);
}

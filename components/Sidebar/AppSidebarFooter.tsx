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
import { appRoutes } from "@/lib/navigation/routes";
import { usePlatformPartnerMe } from "@/lib/queries/platform-partnerships";
import { ChevronsUpDown, Handshake, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import SubscriptionBadge from "./SubscriptionBadge";

export default function AppSidebarFooter({
	user,
	organization,
}: {
	user: TAuthUserSession["user"];
	organization: NonNullable<TAuthUserSession["membership"]>["organizacao"];
}) {
	const { isMobile } = useSidebar();
	// Situação no programa de parcerias só quando o menu abre: o rótulo depende dela, mas não vale
	// uma requisição a cada página do app.
	const [menuOpen, setMenuOpen] = useState(false);
	const { data: partner, isLoading: partnerLoading } = usePlatformPartnerMe({ enabled: menuOpen });
	const partnerLabel = partnerLoading
		? "Programa de Parcerias"
		: partner?.status === "ATIVO"
			? "Painel do parceiro"
			: partner
				? "Programa de Parcerias"
				: "Indique e ganhe";

	return (
		<SidebarMenu>
			<SubscriptionBadge organization={organization} />

			<SidebarMenuItem>
				<ThemeToggle />
			</SidebarMenuItem>

			<SidebarMenuItem>
				<DropdownMenu onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
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
						}
					/>
					<DropdownMenuContent className="w-(--anchor-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
						<DropdownMenuGroup>
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
										<Link href={appRoutes.settings()}>
											<UserRound />
											Configurações
										</Link>
									</SidebarMenuButton>
								</DropdownMenuItem>
								{/* Para todos: quem ainda não é parceiro cai no cadastro do programa (o painel redireciona). */}
								<DropdownMenuItem>
									<SidebarMenuButton asChild>
										<Link href="/partner-dashboard">
											<Handshake />
											{partnerLabel}
										</Link>
									</SidebarMenuButton>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem>
								<SidebarMenuButton asChild>
									<Link href="/auth/logout" prefetch={false}>
										<LogOut />
										Sair
									</Link>
								</SidebarMenuButton>
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

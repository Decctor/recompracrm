"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { switchOrganization } from "@/lib/mutations/organizations";
import { useUserMemberships } from "@/lib/queries/organizations";
import LogoIcon from "@/utils/images/logo-icon.png";
import { useMutation } from "@tanstack/react-query";
import { ArrowRightLeft, Check, ChevronsUpDown, Loader2, Plus, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type AppSidebarHeaderProps = {
	sessionUserOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"] | null;
	user: TAuthUserSession["user"];
	mode?: "app" | "admin";
};

export default function AppSidebarHeader({ sessionUserOrg, user, mode = "app" }: AppSidebarHeaderProps) {
	const { isMobile } = useSidebar();
	const { data: membershipsData } = useUserMemberships();

	const switchOrgMutation = useMutation({
		mutationFn: switchOrganization,
		onSuccess: () => {
			window.location.reload();
		},
	});

	const memberships = membershipsData?.memberships ?? [];
	const activeOrganizationId = membershipsData?.activeOrganizationId ?? sessionUserOrg?.id;
	const hasMultipleOrgs = memberships.length > 1;
	const isAdminMode = mode === "admin";
	const showPanelLink = mode === "admin" || user.admin;
	const panelHref = mode === "admin" ? "/dashboard" : "/admin-dashboard";
	const panelLabel = mode === "admin" ? "Dashboard" : "Painel Admin";
	const panelLabelUppercase = mode === "admin" ? "DASHBOARD" : "PAINEL ADMIN";
	const PanelIcon = mode === "admin" ? ArrowRightLeft : Shield;

	// Static header for single org or no org
	if (!hasMultipleOrgs) {
		return (
			<SidebarMenu>
				<SidebarMenuItem className="flex items-center justify-center">
					{isAdminMode ? (
						<div className="flex items-center gap-2 w-full self-center">
							<div className="relative w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 self-center rounded-lg overflow-hidden">
								<Image src={LogoIcon} alt="RecompraCRM Admin" fill />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">ADMIN</span>
							</div>
						</div>
					) : sessionUserOrg ? (
						<div className="flex items-center gap-2 w-full self-center">
							<div className="relative w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 self-center rounded-lg overflow-hidden">
								<Image src={sessionUserOrg.logoUrl ?? LogoIcon} alt={sessionUserOrg.nome} fill />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{sessionUserOrg.nome}</span>
							</div>
						</div>
					) : (
						<div className="flex items-center gap-2 w-full self-center">
							<div className="relative w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 self-center rounded-lg overflow-hidden">
								<Image src={LogoIcon} alt="Logo Ampère Mais" fill />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">RecompraCRM</span>
							</div>
						</div>
					)}
				</SidebarMenuItem>
				{showPanelLink && (
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link href={panelHref}>
								<PanelIcon className="w-4 h-4 min-w-4 min-h-4" />
								<span>{panelLabel}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				)}
			</SidebarMenu>
		);
	}

	// Dropdown for multiple orgs
	const currentOrg = memberships.find((m) => m.organizacao.id === activeOrganizationId)?.organizacao ?? sessionUserOrg;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
							<div className="relative w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8 rounded-lg overflow-hidden">
								<Image
									src={isAdminMode ? LogoIcon : currentOrg?.logoUrl ?? LogoIcon}
									alt={isAdminMode ? "Admin" : currentOrg?.nome ?? "Organização"}
									fill
								/>
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{isAdminMode ? "ADMIN" : currentOrg?.nome ?? "Selecionar organização"}</span>
							</div>
							{switchOrgMutation.isPending ? <Loader2 className="ml-auto size-4 animate-spin" /> : <ChevronsUpDown className="ml-auto size-4" />}
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="start"
						sideOffset={4}
					>
						<DropdownMenuLabel>Organizações</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{memberships.map((membership) => {
							const isActive = membership.organizacao.id === activeOrganizationId;
							return (
								<DropdownMenuItem
									key={membership.id}
									onClick={() => {
										if (!isActive && !switchOrgMutation.isPending) {
											switchOrgMutation.mutate({ organizationId: membership.organizacao.id });
										}
									}}
									className="cursor-pointer"
									disabled={switchOrgMutation.isPending}
								>
									<div className="flex items-center gap-2 w-full">
										<div className="relative w-6 h-6 min-w-6 min-h-6 rounded-md overflow-hidden">
											<Image src={membership.organizacao.logoUrl ?? LogoIcon} alt={membership.organizacao.nome} fill />
										</div>
										<span className="flex-1 truncate">{membership.organizacao.nome}</span>
										{isActive && <Check className="size-4 text-primary" />}
									</div>
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild className="cursor-pointer">
							<Link href="/onboarding">
								<div className="flex items-center justify-center gap-2 w-full">
									<Plus className="w-4 h-4 min-w-4 min-h-4" />
									<span className="flex-1 truncate">NOVA ORGANIZAÇÃO</span>
								</div>
							</Link>
						</DropdownMenuItem>
						{showPanelLink && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild className="cursor-pointer">
									<Link href={panelHref}>
										<div className="flex items-center justify-center gap-2 w-full">
											<PanelIcon className="w-4 h-4 min-w-4 min-h-4" />
											<span className="flex-1 truncate">{panelLabelUppercase}</span>
										</div>
									</Link>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

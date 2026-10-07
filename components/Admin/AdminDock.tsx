"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenuGroup,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatNameAsInitials } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Handshake, LogOut, MonitorDown, Palette, Shield, Smartphone, VideoIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TAdminDockNavItem = {
	title: string;
	url: string;
	icon: React.ReactNode;
	exact?: boolean;
};

const ADMIN_DOCK_NAV: TAdminDockNavItem[] = [
	{ title: "Ativação", url: "/admin-dashboard/onboarding", icon: <ArrowRightLeft className="size-[18px]" strokeWidth={1.75} /> },
	{
		title: "Painel Admin",
		url: "/admin-dashboard",
		icon: <Shield className="size-[18px]" strokeWidth={1.75} />,
		exact: true,
	},
	{
		title: "Parcerias",
		url: "/admin-dashboard/partnerships",
		icon: <Handshake className="size-[18px]" strokeWidth={1.75} />,
	},
	{
		title: "Comunidade",
		url: "/admin-dashboard/community",
		icon: <VideoIcon className="size-[18px]" strokeWidth={1.75} />,
	},
	{
		title: "Assets da Marca",
		url: "/admin-dashboard/brand-assets",
		icon: <Palette className="size-[18px]" strokeWidth={1.75} />,
	},
	{
		title: "Agente Desktop",
		url: "/admin-dashboard/desktop-agent",
		icon: <MonitorDown className="size-[18px]" strokeWidth={1.75} />,
	},
	{
		title: "Maquininhas",
		url: "/admin-dashboard/payment-attempts",
		icon: <Smartphone className="size-[18px]" strokeWidth={1.75} />,
	},
];

type AdminDockProps = {
	user: TAuthUserSession["user"];
};

function DockDivider() {
	return <div className="mx-1 h-6 w-px shrink-0 bg-border/80" aria-hidden="true" />;
}

function isNavActive(pathname: string, item: TAdminDockNavItem) {
	if (item.exact) return pathname === item.url;
	return pathname === item.url || pathname.startsWith(`${item.url}/`);
}

export function AdminDock({ user }: AdminDockProps) {
	const pathname = usePathname();

	return (
		<TooltipProvider delay={200}>
			<nav aria-label="Navegação do painel admin" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:pb-6">
				<div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-md">
					<div className="flex items-center pl-1">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<button
										type="button"
										className="flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
										aria-label="Menu da conta"
									>
										<Avatar className="size-8 ring-2 ring-border/60">
											<AvatarImage src={user.avatarUrl ?? undefined} alt={user.nome} />
											<AvatarFallback className="bg-muted text-xs">{formatNameAsInitials(user.nome)}</AvatarFallback>
										</Avatar>
									</button>
								}
							/>
							<DropdownMenuContent side="top" align="start" sideOffset={12} className="min-w-52 rounded-xl">
								<DropdownMenuGroup>
									<DropdownMenuLabel className="p-0 font-normal">
										<div className="flex items-center gap-2 px-2 py-2">
											<Avatar className="size-8">
												<AvatarImage src={user.avatarUrl ?? undefined} alt={user.nome} />
												<AvatarFallback>{formatNameAsInitials(user.nome)}</AvatarFallback>
											</Avatar>
											<div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
												<span className="truncate font-medium">{user.nome}</span>
												<span className="truncate text-xs text-muted-foreground">{user.email}</span>
											</div>
										</div>
									</DropdownMenuLabel>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem
										className="cursor-pointer"
										render={
											<Link href="/dashboard">
												<ArrowRightLeft className="size-4" />
												Ir para o dashboard
											</Link>
										}
									/>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuItem
										className="cursor-pointer"
										render={
											<Link href="/auth/logout" prefetch={false}>
												<LogOut className="size-4" />
												Sair
											</Link>
										}
									/>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<DockDivider />

					<div className="flex items-center gap-0.5 px-1">
						{ADMIN_DOCK_NAV.map((item) => {
							const active = isNavActive(pathname, item);
							return (
								<Tooltip key={item.url}>
									<TooltipTrigger
										render={
											<Link
												href={item.url}
												className={cn(
													"flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
													active && "bg-primary/10 text-primary",
												)}
												aria-label={item.title}
												aria-current={active ? "page" : undefined}
											>
												{item.icon}
											</Link>
										}
									/>
									<TooltipContent side="top" className="text-xs">
										{item.title}
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>

					<DockDivider />

					<div className="flex items-center pr-1">
						<Tooltip>
							<TooltipTrigger
								render={
									<Link
										href="/admin-dashboard"
										className="flex size-9 items-center justify-center rounded-full outline-none transition-colors bg-brand-secondary focus-visible:ring-2 focus-visible:ring-ring/40"
										aria-label="Painel Admin RecompraCRM"
									>
										<div className="relative size-7 overflow-hidden rounded-lg">
											<BrandLogo lockup="icon" tone="color-on-dark" alt="" fill className="object-cover" aria-hidden />
										</div>
									</Link>
								}
							/>
							<TooltipContent side="top" className="text-xs">
								Painel Admin
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</nav>
		</TooltipProvider>
	);
}

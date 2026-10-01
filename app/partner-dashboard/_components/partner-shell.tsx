"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { cn } from "@/lib/utils";
import { ArrowLeft, Building2, Eye, EyeOff, House, ReceiptText, Share2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext } from "react";
import { HideValuesProvider, useHideValues } from "./partner-ui";

const NAV_ITEMS = [
	{
		href: "/partner-dashboard",
		label: "Início",
		icon: House,
		match: (path: string) => path === "/partner-dashboard" || path.startsWith("/partner-dashboard/payouts"),
	},
	{ href: "/partner-dashboard/stores", label: "Lojas", icon: Building2, match: (path: string) => path.startsWith("/partner-dashboard/stores") },
	{ href: "/partner-dashboard/share", label: "Divulgar", icon: Share2, match: (path: string) => path.startsWith("/partner-dashboard/share") },
	{
		href: "/partner-dashboard/statement",
		label: "Extrato",
		icon: ReceiptText,
		match: (path: string) => path.startsWith("/partner-dashboard/statement"),
	},
];

// Rota do app principal quando o parceiro também é usuário de uma loja; `null` para parceiro só parceiro.
const MainAppLinkContext = createContext<string | null>(null);
export function useMainAppHref() {
	return useContext(MainAppLinkContext);
}

/** Volta para o RecompraCRM. Só aparece para quem tem loja: parceiro sem loja não tem para onde voltar. */
export function MainAppLink({ href, className }: { href: string | null; className?: string }) {
	if (!href) return null;
	return (
		<Link
			href={href}
			className={cn("inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground", className)}
		>
			<ArrowLeft className="h-4 w-4" />
			Voltar ao RecompraCRM
		</Link>
	);
}

export function HideValuesButton({ className }: { className?: string }) {
	const { hidden, toggle } = useHideValues();
	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
			aria-pressed={hidden}
			className={cn(
				"flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:outline-none",
				className,
			)}
		>
			{hidden ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
		</button>
	);
}

/** Atalho para "Meus dados" (fica fora das abas: é consulta eventual, não navegação do dia a dia). */
export function ProfileButton({ className }: { className?: string }) {
	const pathname = usePathname();
	const active = pathname.startsWith("/partner-dashboard/profile");
	return (
		<Link
			href="/partner-dashboard/profile"
			aria-label="Meus dados"
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-primary/30 focus-visible:outline-none",
				active && "border-primary/30 bg-info-surface text-primary",
				className,
			)}
		>
			<UserRound className="h-[18px] w-[18px]" />
		</Link>
	);
}

/**
 * Moldura do painel: barra superior com navegação no desktop, barra de abas fixa embaixo no
 * celular (o protótipo é mobile e a navegação por polegar é o que o parceiro usa na rua).
 */
export function PartnerShell({ children, mainAppHref = null }: { children: ReactNode; mainAppHref?: string | null }) {
	const pathname = usePathname();
	return (
		<MainAppLinkContext value={mainAppHref}>
			<HideValuesProvider>
				<div className="flex min-h-dvh w-full flex-col bg-muted">
					<header className="sticky top-0 z-30 hidden border-b border-border bg-card/95 md:block">
						<div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-6 px-6">
							<Link href="/partner-dashboard" className="flex items-center gap-3">
								<BrandLogo lockup="icon-badge" tone="color" width={32} height={32} className="rounded-full" />
								<span className="text-label text-primary">Programa de Parcerias</span>
							</Link>
							<nav className="flex flex-1 items-center gap-1" aria-label="Painel do parceiro">
								{NAV_ITEMS.map((item) => {
									const active = item.match(pathname);
									return (
										<Link
											key={item.href}
											href={item.href}
											aria-current={active ? "page" : undefined}
											className={cn(
												"flex h-10 items-center gap-2 rounded-[14px] px-4 text-sm font-bold transition-colors",
												active ? "bg-info-surface text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
											)}
										>
											<item.icon className="h-4 w-4" />
											{item.label}
										</Link>
									);
								})}
							</nav>
							<div className="flex items-center gap-2">
								<MainAppLink href={mainAppHref} className="mr-2" />
								<HideValuesButton />
								<ProfileButton />
							</div>
						</div>
					</header>

					<main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col pb-[calc(88px+env(safe-area-inset-bottom))] md:px-6 md:pt-6 md:pb-12">
						{children}
					</main>

					<nav
						aria-label="Painel do parceiro"
						className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card px-3 pt-2.5 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden"
					>
						{NAV_ITEMS.map((item) => {
							const active = item.match(pathname);
							return (
								<Link
									key={item.href}
									href={item.href}
									aria-current={active ? "page" : undefined}
									className={cn("flex flex-col items-center gap-1 text-[11px]", active ? "font-bold text-primary" : "font-semibold text-muted-foreground")}
								>
									<item.icon className="h-[22px] w-[22px]" />
									{item.label}
								</Link>
							);
						})}
					</nav>
				</div>
			</HideValuesProvider>
		</MainAppLinkContext>
	);
}

/**
 * Faixa branca do topo das telas no celular (cantos de baixo arredondados, como no protótipo). No
 * desktop vira um cartão comum dentro da grade.
 */
export function TopSheet({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"flex flex-col bg-card px-4 pt-[max(12px,env(safe-area-inset-top))] pb-6 text-numeric shadow-[0_1px_2px_rgba(0,0,0,0.04)] max-md:rounded-b-[26px] md:rounded-[22px] md:p-5 md:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.04)]",
				className,
			)}
		>
			{children}
		</div>
	);
}

/** Área de conteúdo abaixo da faixa do topo. */
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex flex-col gap-3 p-4 md:px-0 md:pb-0", className)}>{children}</div>;
}

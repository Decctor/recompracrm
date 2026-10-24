"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ANCHOR_LINKS: { label: string; href: string; isRoute?: boolean }[] = [
	{ label: "Como funciona", href: "#como-funciona" },
	{ label: "Resultado", href: "#movimento" },
	{ label: "Funcionalidades", href: "#inventario" },
	{ label: "Segmentos", href: "/segments", isRoute: true },
	{ label: "Planos", href: "#saldo" },
	// { label: "Parcerias", href: "/partnerships", isRoute: true },
];

export function LedgerNavbar() {
	const [scrolled, setScrolled] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const pathname = usePathname();
	const isHomePage = pathname === "/";

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 24);
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const handleAnchorClick = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>, href: string, isMobileMenu: boolean) => {
			captureClientEvent({
				event: "landing_nav_click",
				properties: {
					target_section: href.replace("#", ""),
					is_mobile_menu: isMobileMenu,
				},
			});
			setMobileOpen(false);
			if (isHomePage) {
				e.preventDefault();
				const el = document.querySelector(href);
				if (el) el.scrollIntoView({ behavior: "smooth" });
			}
		},
		[isHomePage],
	);

	return (
		<header className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out", scrolled ? "pt-3 px-3 lg:px-4" : "pt-0 px-0")}>
			{/* Main navbar — morphs into a floating pill on scroll */}
			<div
				className={cn(
					"mx-auto flex items-center justify-between transition-all duration-300 ease-out",
					scrolled
						? "h-14 max-w-5xl rounded-full border border-[#e5e5e5] bg-white/80 px-3 shadow-[0_12px_30px_-12px_rgba(36,84,156,0.28),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-md lg:px-5"
						: "h-16 max-w-7xl rounded-full border border-transparent bg-transparent px-5 lg:px-8",
				)}
			>
				<Link href="/" className={cn("relative shrink-0 transition-all duration-300 ease-out", scrolled ? "h-7 w-[185px]" : "h-8 w-[214px]")}>
					<BrandLogo lockup="horizontal-badge" tone="color-on-light" alt="RecompraCRM" fill className="object-contain object-left" priority />
				</Link>
				<nav className="hidden md:flex items-center gap-7">
					{ANCHOR_LINKS.map((link) =>
						link.isRoute ? (
							<Link key={link.href} href={link.href} className="text-[13px] font-bold text-[#171717]/75 hover:text-[#24549c] transition-colors">
								{link.label}
							</Link>
						) : (
							<a
								key={link.href}
								href={isHomePage ? link.href : `/${link.href}`}
								onClick={(e) => handleAnchorClick(e, link.href, false)}
								className="text-[13px] font-bold text-[#171717]/75 hover:text-[#24549c] transition-colors"
							>
								{link.label}
							</a>
						),
					)}
					<Link href="/blog" className="text-[13px] font-bold text-[#171717]/75 hover:text-[#24549c] transition-colors">
						Blog
					</Link>
				</nav>

				<div className="hidden md:flex items-center gap-3">
					<Link href="/auth/signin" className="text-[13px] font-bold text-[#171717]/75 hover:text-[#24549c] transition-colors">
						Entrar
					</Link>
					<a
						href="https://wa.me/553499480791?text=Olá, gostaria de agendar uma demonstração."
						target="_blank"
						rel="noopener noreferrer"
						onClick={() =>
							captureClientEvent({
								event: "landing_cta_clicked",
								controlEvent: "contact",
								properties: { cta_id: "navbar_agendar_demo", location: "navbar" },
							})
						}
						className="bg-[#24549c] hover:bg-[#1a3d7a] text-white text-[12px] font-extrabold tracking-[0.04em] uppercase px-4 py-2.5 rounded-xl shadow-[0_6px_14px_-4px_rgba(36,84,156,0.32),0_2px_4px_rgba(36,84,156,0.18)] hover:-translate-y-0.5 transition-all duration-200"
					>
						Agendar demo
					</a>
				</div>

				<button type="button" className="md:hidden p-2 text-[#171717]" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
					{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
				</button>
			</div>

			{mobileOpen && (
				<div className="md:hidden mx-3 mt-2 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_16px_40px_-16px_rgba(36,84,156,0.28),0_4px_10px_rgba(0,0,0,0.06)]">
					<div className="flex flex-col gap-1 px-4 py-4">
						{ANCHOR_LINKS.map((link) =>
							link.isRoute ? (
								<Link
									key={link.href}
									href={link.href}
									onClick={() => setMobileOpen(false)}
									className="text-[14px] font-bold text-[#171717] py-2.5 rounded-lg hover:bg-[#f7f9fc] px-3"
								>
									{link.label}
								</Link>
							) : (
								<a
									key={link.href}
									href={isHomePage ? link.href : `/${link.href}`}
									onClick={(e) => handleAnchorClick(e, link.href, true)}
									className="text-[14px] font-bold text-[#171717] py-2.5 rounded-lg hover:bg-[#f7f9fc] px-3"
								>
									{link.label}
								</a>
							),
						)}
						<Link
							href="/blog"
							onClick={() => setMobileOpen(false)}
							className="text-[14px] font-bold text-[#171717] py-2.5 rounded-lg hover:bg-[#f7f9fc] px-3"
						>
							Blog
						</Link>
						<Link
							href="/auth/signin"
							onClick={() => setMobileOpen(false)}
							className="text-[14px] font-bold text-[#171717] py-2.5 rounded-lg hover:bg-[#f7f9fc] px-3"
						>
							Entrar
						</Link>
						<a
							href="https://wa.me/553499480791?text=Olá, gostaria de agendar uma demonstração."
							target="_blank"
							rel="noopener noreferrer"
							className="mt-2 bg-[#24549c] text-white text-[13px] font-extrabold tracking-[0.04em] uppercase px-4 py-3.5 rounded-xl text-center"
						>
							Agendar demo
						</a>
					</div>
				</div>
			)}
		</header>
	);
}

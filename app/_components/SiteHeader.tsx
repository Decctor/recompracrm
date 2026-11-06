"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useEffect, useState } from "react";

/**
 * SiteHeader — a reusable, branding-focused header inspired by the Ledger navbar.
 *
 * It's a compound component: the pieces read shared state (scroll morph, mobile
 * open, current route) from context, so consumers compose exactly the structure
 * they need instead of toggling boolean props. Nav links and actions are fully
 * dynamic — drop in whatever `NavLink`/`Cta`/custom nodes you want.
 *
 * The same `NavLink`/`Cta` render differently depending on whether they sit in a
 * `<Nav>`/`<Actions>` cluster (desktop) or inside `<MobileMenu>` — the surrounding
 * container injects that "surface" via context, so you never restyle by hand.
 *
 * @example
 * <SiteHeader.Root>
 *   <SiteHeader.Bar>
 *     <SiteHeader.Logo src={logo} />
 *     <SiteHeader.Nav>
 *       {LINKS.map((l) => <SiteHeader.NavLink key={l.href} {...l} />)}
 *     </SiteHeader.Nav>
 *     <SiteHeader.Actions>
 *       <SiteHeader.NavLink href="/auth/signin">Entrar</SiteHeader.NavLink>
 *       <SiteHeader.Cta href="/demo" external>Agendar demo</SiteHeader.Cta>
 *     </SiteHeader.Actions>
 *     <SiteHeader.MobileToggle />
 *   </SiteHeader.Bar>
 *   <SiteHeader.MobileMenu>
 *     {LINKS.map((l) => <SiteHeader.NavLink key={l.href} {...l} />)}
 *     <SiteHeader.NavLink href="/auth/signin">Entrar</SiteHeader.NavLink>
 *     <SiteHeader.Cta href="/demo" external>Agendar demo</SiteHeader.Cta>
 *   </SiteHeader.MobileMenu>
 * </SiteHeader.Root>
 */

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SiteHeaderContextValue = {
	scrolled: boolean;
	mobileOpen: boolean;
	setMobileOpen: (open: boolean) => void;
	isHomePage: boolean;
	/** Handles anchor smooth-scroll (on the homepage) + analytics, then closes the mobile sheet. */
	onNavigate: (href: string, e: React.MouseEvent<HTMLAnchorElement>, meta: { isMobile: boolean }) => void;
};

const SiteHeaderContext = createContext<SiteHeaderContextValue | null>(null);

function useSiteHeader() {
	const ctx = use(SiteHeaderContext);
	if (!ctx) throw new Error("SiteHeader.* must be rendered inside <SiteHeader.Root>.");
	return ctx;
}

/** Which surface a child renders on. Set by the container, read by links/actions to style themselves. */
type Surface = "desktop" | "mobile";
const SurfaceContext = createContext<Surface>("desktop");

// ---------------------------------------------------------------------------
// Root — owns state, renders the fixed <header> shell
// ---------------------------------------------------------------------------

type RootProps = {
	children: React.ReactNode;
	/** Pixels scrolled before the bar morphs into the floating pill. Default 24. */
	scrollThreshold?: number;
	className?: string;
};

function SiteHeaderRoot({ children, scrollThreshold = 24, className }: RootProps) {
	const [scrolled, setScrolled] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const pathname = usePathname();
	const isHomePage = pathname === "/";

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > scrollThreshold);
		handleScroll();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [scrollThreshold]);

	const onNavigate = useCallback<SiteHeaderContextValue["onNavigate"]>(
		(href, e, { isMobile }) => {
			const isAnchor = href.startsWith("#");
			if (isAnchor) {
				captureClientEvent({
					event: "landing_nav_click",
					properties: { target_section: href.replace("#", ""), is_mobile_menu: isMobile },
				});
			}
			setMobileOpen(false);
			// On the homepage, anchors smooth-scroll in place; elsewhere they fall through to /#section.
			if (isAnchor && isHomePage) {
				e.preventDefault();
				const el = document.querySelector(href);
				if (el) el.scrollIntoView({ behavior: "smooth" });
			}
		},
		[isHomePage],
	);

	return (
		<SiteHeaderContext value={{ scrolled, mobileOpen, setMobileOpen, isHomePage, onNavigate }}>
			<header
				className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-out", scrolled ? "pt-3 px-3 lg:px-4" : "pt-0 px-0", className)}
			>
				{children}
			</header>
		</SiteHeaderContext>
	);
}

// ---------------------------------------------------------------------------
// Bar — the pill that morphs on scroll
// ---------------------------------------------------------------------------

function SiteHeaderBar({ children }: { children: React.ReactNode }) {
	const { scrolled } = useSiteHeader();
	return (
		<div
			className={cn(
				"mx-auto flex items-center justify-between transition-all duration-300 ease-out",
				scrolled
					? "h-14 max-w-5xl rounded-full border border-[#e5e5e5] bg-white/80 px-3 shadow-[0_12px_30px_-12px_rgba(36,84,156,0.28),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-md lg:px-5"
					: "h-16 max-w-7xl rounded-full border border-transparent bg-transparent px-5 lg:px-8",
			)}
		>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

type LogoProps = {
	src: StaticImageData | string;
	alt?: string;
	href?: string;
};

function SiteHeaderLogo({ src, alt = "RecompraCRM", href = "/" }: LogoProps) {
	const { scrolled } = useSiteHeader();
	return (
		<Link href={href} className={cn("relative shrink-0 transition-all duration-300 ease-out", scrolled ? "h-7 w-[185px]" : "h-8 w-[214px]")}>
			<Image src={src} alt={alt} fill className="object-contain object-left" priority />
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Nav / Actions — desktop clusters (hidden on mobile), declare the desktop surface
// ---------------------------------------------------------------------------

function SiteHeaderNav({ children }: { children: React.ReactNode }) {
	return (
		<SurfaceContext value="desktop">
			<nav className="hidden md:flex items-center gap-7">{children}</nav>
		</SurfaceContext>
	);
}

function SiteHeaderActions({ children }: { children: React.ReactNode }) {
	return (
		<SurfaceContext value="desktop">
			<div className="hidden md:flex items-center gap-3">{children}</div>
		</SurfaceContext>
	);
}

// ---------------------------------------------------------------------------
// Mobile toggle + sheet
// ---------------------------------------------------------------------------

function SiteHeaderMobileToggle() {
	const { mobileOpen, setMobileOpen } = useSiteHeader();
	return (
		<button
			type="button"
			className="md:hidden p-2 text-[#171717]"
			onClick={() => setMobileOpen(!mobileOpen)}
			aria-label="Menu"
			aria-expanded={mobileOpen}
		>
			{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
		</button>
	);
}

function SiteHeaderMobileMenu({ children }: { children: React.ReactNode }) {
	const { mobileOpen } = useSiteHeader();
	if (!mobileOpen) return null;
	return (
		<SurfaceContext value="mobile">
			<div className="md:hidden mx-3 mt-2 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_16px_40px_-16px_rgba(36,84,156,0.28),0_4px_10px_rgba(0,0,0,0.06)]">
				<div className="flex flex-col gap-1 px-4 py-4">{children}</div>
			</div>
		</SurfaceContext>
	);
}

// ---------------------------------------------------------------------------
// NavLink — dynamic redirect item. Anchors (#) smooth-scroll + track; the rest route.
// ---------------------------------------------------------------------------

type NavLinkProps = {
	href: string;
	label?: string;
	children?: React.ReactNode;
	className?: string;
};

function SiteHeaderNavLink({ href, label, children, className }: NavLinkProps) {
	const { isHomePage, onNavigate, setMobileOpen } = useSiteHeader();
	const surface = use(SurfaceContext);
	const isAnchor = href.startsWith("#");

	const base =
		surface === "desktop"
			? "text-[13px] font-bold text-[#171717]/75 hover:text-[#24549c] transition-colors"
			: "text-[14px] font-bold text-[#171717] py-2.5 rounded-lg hover:bg-[#f7f9fc] px-3";
	const content = children ?? label;

	if (isAnchor) {
		return (
			<a href={isHomePage ? href : `/${href}`} onClick={(e) => onNavigate(href, e, { isMobile: surface === "mobile" })} className={cn(base, className)}>
				{content}
			</a>
		);
	}
	return (
		<Link href={href} onClick={() => setMobileOpen(false)} className={cn(base, className)}>
			{content}
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Cta — the filled action button (right side / bottom of the mobile sheet)
// ---------------------------------------------------------------------------

type CtaProps = {
	href: string;
	children: React.ReactNode;
	/** Opens in a new tab with safe rel — use for wa.me / external links. */
	external?: boolean;
	onClick?: () => void;
	className?: string;
};

function SiteHeaderCta({ href, children, external, onClick, className }: CtaProps) {
	const surface = use(SurfaceContext);
	const { setMobileOpen } = useSiteHeader();

	const base =
		surface === "desktop"
			? "bg-[#24549c] hover:bg-[#1a3d7a] text-white text-[12px] font-extrabold tracking-[0.04em] uppercase px-4 py-2.5 rounded-xl shadow-[0_6px_14px_-4px_rgba(36,84,156,0.32),0_2px_4px_rgba(36,84,156,0.18)] hover:-translate-y-0.5 transition-all duration-200"
			: "mt-2 bg-[#24549c] text-white text-[13px] font-extrabold tracking-[0.04em] uppercase px-4 py-3.5 rounded-xl text-center";

	const handleClick = () => {
		setMobileOpen(false);
		onClick?.();
	};

	if (external) {
		return (
			<a href={href} target="_blank" rel="noopener noreferrer" onClick={handleClick} className={cn(base, className)}>
				{children}
			</a>
		);
	}
	return (
		<Link href={href} onClick={handleClick} className={cn(base, className)}>
			{children}
		</Link>
	);
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------

export const SiteHeader = {
	Root: SiteHeaderRoot,
	Bar: SiteHeaderBar,
	Logo: SiteHeaderLogo,
	Nav: SiteHeaderNav,
	NavLink: SiteHeaderNavLink,
	Actions: SiteHeaderActions,
	Cta: SiteHeaderCta,
	MobileToggle: SiteHeaderMobileToggle,
	MobileMenu: SiteHeaderMobileMenu,
};

export type { NavLinkProps, CtaProps };

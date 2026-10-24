"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { cn } from "@/lib/utils";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Header "dock" das páginas de marketing. No topo é uma barra larga e transparente; ao rolar
// encolhe para uma cápsula flutuante. Escurece sobre qualquer seção marcada com
// `data-dock="dark"`, destaca o link da seção em leitura e troca o CTA conforme o contexto.
// No artigo mostra "Lendo · <seção>" (lido de `[data-outline]`) e a barra de progresso
// (medida em `[data-article]`).

export type TDockVariant = "landing" | "erp" | "blog" | "artigo" | "product" | "cases" | "tools" | "integrations" | "help" | "partners";

type TDockLink = { label: string; id?: string; href?: string };

const LINKS: Record<TDockVariant, TDockLink[]> = {
	landing: [
		{ id: "frentes", label: "Duas frentes" },
		{ id: "cashback", label: "Como funciona" },
		{ id: "resultado", label: "Cases" },
		{ id: "planos", label: "Planos" },
		{ label: "ERP", href: "/erp" },
		{ label: "Blog", href: "/blog" },
	],
	erp: [
		{ id: "canais", label: "Canais" },
		{ id: "cadeia", label: "A venda" },
		{ id: "modulos", label: "Módulos" },
		{ id: "implantacao", label: "Implantação" },
		{ label: "CRM", href: "/" },
	],
	blog: [
		{ id: "artigos", label: "Artigos" },
		{ label: "Produto", href: "/" },
		{ label: "ERP", href: "/erp" },
	],
	artigo: [],
	product: [
		{ id: "conteudo", label: "Como funciona" },
		{ id: "perguntas-frequentes", label: "Dúvidas" },
		{ label: "Integrações", href: "/integrations" },
		{ label: "Planos", href: "/#planos" },
	],
	cases: [
		{ id: "cases", label: "Cases" },
		{ label: "Funcionalidades", href: "/features/programa-de-cashback" },
		{ label: "Planos", href: "/#planos" },
	],
	tools: [
		{ label: "Calculadora de cashback", href: "/tools/cashback-calculator" },
		{ label: "Custo do WhatsApp", href: "/tools/whatsapp-cost" },
		{ label: "Blog", href: "/blog" },
	],
	integrations: [
		{ id: "conectores", label: "Conectores" },
		{ label: "Funcionalidades", href: "/features/programa-de-cashback" },
		{ label: "Ajuda", href: "/help" },
	],
	help: [
		{ id: "tutoriais", label: "Tutoriais" },
		{ label: "Integrações", href: "/integrations" },
		{ label: "Blog", href: "/blog" },
	],
	partners: [
		{ id: "como-funciona-parceria", label: "Como funciona" },
		{ id: "esquema-de-pagamento", label: "Pagamento" },
		{ id: "calculadora", label: "Calculadora" },
		{ id: "para-quem", label: "Para quem é" },
	],
};

const WHATSAPP_SPECIALIST = "https://wa.me/553499480791?text=Olá, gostaria de falar com um especialista do RecompraCRM.";
const WHATSAPP_SUPPORT = "https://wa.me/553499480791?text=Olá, preciso de ajuda com o RecompraCRM.";
const TRIAL = { label: "Testar 15 dias grátis", short: "Testar grátis", href: "/auth/signup" };
const DEMO = { label: "Agendar demonstração", short: "Agendar demo", href: "#cta" };

// `_` é o CTA padrão; as demais chaves são ids de seção que trocam o CTA quando estão em leitura.
const CTA: Record<TDockVariant, Record<string, { label: string; short: string; href: string }>> = {
	landing: {
		_: { label: "Testar 15 dias grátis", short: "Testar grátis", href: "/auth/signup" },
		planos: { label: "Escolher plano", short: "Ver planos", href: "#planos" },
		erp: { label: "Conhecer o ERP", short: "Ver ERP", href: "/erp" },
		faq: { label: "Falar com especialista", short: "Falar conosco", href: WHATSAPP_SPECIALIST },
	},
	erp: {
		_: { label: "Falar com especialista", short: "Falar conosco", href: WHATSAPP_SPECIALIST },
		top: { label: "Ver por dentro", short: "Ver por dentro", href: "#canais" },
	},
	blog: { _: { label: "Testar 15 dias grátis", short: "Testar grátis", href: "/auth/signup" } },
	artigo: { _: DEMO },
	product: { _: DEMO },
	cases: { _: DEMO },
	tools: { _: TRIAL },
	integrations: { _: TRIAL, cta: DEMO },
	help: { _: { label: "Falar com o suporte", short: "Suporte", href: WHATSAPP_SUPPORT } },
	partners: { _: { label: "Entrar no programa", short: "Participar", href: "/auth/signin?redirectTo=%2Fpartner-dashboard" } },
};

const TAG: Record<TDockVariant, string | null> = {
	landing: null,
	erp: "ERP",
	blog: "Blog",
	artigo: "Blog",
	product: "Produto",
	cases: "Cases",
	tools: "Ferramentas",
	integrations: "Integrações",
	help: "Ajuda",
	partners: "Parceiros",
};
// Página que contém as seções de cada área. Fora dela (num artigo de ajuda, num case), o link de
// seção volta para lá em vez de apontar para uma âncora que não existe na página atual. Sem entrada,
// toda página da área tem as mesmas seções (funcionalidades, integrações).
const SECTIONS_PAGE: Partial<Record<TDockVariant, string>> = {
	landing: "/",
	erp: "/erp",
	blog: "/blog",
	cases: "/cases",
	help: "/help",
	partners: "/partnerships",
};

const HOME_HREF: Record<TDockVariant, string> = {
	landing: "#top",
	erp: "/",
	blog: "/",
	artigo: "/blog",
	product: "/",
	cases: "/",
	tools: "/",
	integrations: "/",
	help: "/",
	partners: "/",
};

// Quanto mais links (e a etiqueta da área), mais cedo a barra recolhe para o menu. As classes
// ficam literais para o Tailwind enxergá-las.
const BREAKPOINT_CLASSES = {
	860: {
		wide: "min-[860px]:max-w-[880px]",
		flex: "min-[860px]:flex",
		inline: "min-[860px]:inline-flex",
		block: "min-[860px]:block",
		hide: "min-[860px]:hidden",
	},
	960: {
		wide: "min-[960px]:max-w-[880px]",
		flex: "min-[960px]:flex",
		inline: "min-[960px]:inline-flex",
		block: "min-[960px]:block",
		hide: "min-[960px]:hidden",
	},
	1040: {
		wide: "min-[1040px]:max-w-[880px]",
		flex: "min-[1040px]:flex",
		inline: "min-[1040px]:inline-flex",
		block: "min-[1040px]:block",
		hide: "min-[1040px]:hidden",
	},
} as const;

function getBreakpointClasses(variant: TDockVariant) {
	const density = LINKS[variant].length + (TAG[variant] ? 1 : 0);
	return BREAKPOINT_CLASSES[density >= 5 ? 1040 : density >= 4 ? 960 : 860];
}

type DockProps = {
	variant?: TDockVariant;
	theme?: "auto" | "light" | "dark";
	compactOnScroll?: boolean;
};

export function Dock({ variant = "landing", theme = "auto", compactOnScroll = true }: DockProps) {
	const pathname = usePathname();
	const [scrolled, setScrolled] = useState(false);
	const [overDark, setOverDark] = useState(false);
	const [active, setActive] = useState<string | null>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [read, setRead] = useState(0);
	const [heading, setHeading] = useState<string | null>(null);

	useEffect(() => {
		const sectionIds = LINKS[variant]
			.map((l) => l.id)
			.filter((id): id is string => !!id)
			.concat(["top", "erp", "faq", "contato"]);
		const onScroll = () => {
			const probe = 40;
			let dark = false;
			for (const el of document.querySelectorAll('[data-dock="dark"]')) {
				const r = el.getBoundingClientRect();
				if (r.top <= probe && r.bottom >= probe) dark = true;
			}
			let current: string | null = null;
			let best = Number.NEGATIVE_INFINITY;
			for (const id of sectionIds) {
				const el = document.getElementById(id);
				if (!el) continue;
				const top = el.getBoundingClientRect().top;
				if (top <= 140 && top > best) {
					best = top;
					current = id;
				}
			}
			if (variant === "artigo") {
				const article = document.querySelector("[data-article]");
				if (article) {
					const r = article.getBoundingClientRect();
					const progress = Math.max(0, Math.min(1, (120 - r.top) / Math.max(1, r.height - window.innerHeight * 0.6)));
					setRead(Math.round(progress * 200) / 200);
				}
				let h: string | null = null;
				for (const el of document.querySelectorAll("[data-outline]")) {
					if (el.getBoundingClientRect().top <= 160) h = el.getAttribute("data-outline");
				}
				setHeading(h);
			}
			setScrolled(window.scrollY > 24);
			setOverDark(dark);
			setActive(current);
		};
		onScroll();
		const t = setTimeout(onScroll, 600);
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			clearTimeout(t);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, [variant]);

	const handleNavClick = useCallback(
		(target: string, isMobileMenu: boolean) => {
			captureClientEvent({
				event: "landing_nav_click",
				properties: { target_section: target.replace("#", ""), is_mobile_menu: isMobileMenu, dock_variant: variant },
			});
			setMenuOpen(false);
		},
		[variant],
	);

	const dark = theme === "dark" || (theme === "auto" && overDark);
	const compact = compactOnScroll && scrolled;
	const links = LINKS[variant];
	const cta = (active ? CTA[variant][active] : undefined) ?? CTA[variant]._;
	const ctaIsExternal = cta.href.startsWith("http");
	const tag = TAG[variant];
	const sectionsPage = SECTIONS_PAGE[variant];
	const sectionHref = (id?: string) => (sectionsPage && pathname !== sectionsPage ? `${sectionsPage}#${id}` : `#${id}`);
	const bp = getBreakpointClasses(variant);
	const isArticleReading = variant === "artigo" && compact;

	const glass = dark
		? "border-white/10 bg-[rgba(11,22,40,0.72)] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
		: "border-[rgba(14,18,20,0.08)] bg-white/78 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-14px_rgba(16,24,40,0.22)]";
	const ease = "ease-[cubic-bezier(.2,.8,.2,1)]";
	const subText = dark ? "text-white/70" : "text-[#4b585d]";
	const fgText = dark ? "text-white" : "text-[#0e1214]";

	return (
		<div
			className={cn(
				"pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center px-3 font-outfit transition-[top] duration-[450ms]",
				ease,
				compact ? "top-3" : "top-0",
			)}
		>
			<nav
				className={cn(
					"pointer-events-auto relative flex w-full items-center justify-between gap-4 border backdrop-blur-[16px] backdrop-saturate-[1.6]",
					"transition-[max-width,height,padding,border-radius,background-color,border-color,box-shadow] duration-500",
					ease,
					compact ? cn("h-14 max-w-[560px] rounded-full pr-1.5 pl-3.5", bp.wide) : "h-[72px] max-w-[1240px] rounded-none px-3 sm:px-6",
					compact || dark ? glass : "border-transparent bg-transparent shadow-none",
				)}
			>
				{isArticleReading ? (
					<span
						aria-hidden
						className="pointer-events-none absolute inset-x-6 bottom-0 h-0.5 rounded-sm transition-[background] duration-200"
						style={{ background: `linear-gradient(to right, #24549c ${read * 100}%, transparent ${read * 100}%)` }}
					/>
				) : null}
				<Link href={HOME_HREF[variant]} className="flex flex-none items-center gap-2.5 pl-1.5" aria-label="RecompraCRM">
					{compact ? (
						<BrandLogo lockup="icon-badge" tone="color" className="block h-7 w-7 object-contain" priority />
					) : (
						<BrandLogo
							lockup="horizontal-badge"
							tone={dark ? "color-on-dark" : "color-on-light"}
							className="block h-[22px] w-[146px] object-contain object-left sm:h-[26px] sm:w-[172px]"
							priority
						/>
					)}
					{tag ? (
						<span
							className={cn(
								compact ? "inline-flex" : "hidden min-[420px]:inline-flex",
								"h-[22px] items-center rounded-full px-2 text-[11px] font-bold tracking-[0.04em]",
								dark ? "bg-white/12 text-white" : "bg-[#eef2f6] text-[#24549c]",
							)}
						>
							{tag}
						</span>
					) : null}
				</Link>

				{links.length > 0 ? (
					<div className={cn("hidden min-w-0 items-center gap-0.5", bp.flex)}>
						{links.map((link) => {
							const href = link.href ?? sectionHref(link.id);
							const on = !!link.id && link.id === active && !link.href;
							return (
								<Link
									key={href}
									href={href}
									onClick={() => handleNavClick(href, false)}
									className={cn(
										"inline-flex h-9 items-center whitespace-nowrap rounded-full text-sm font-medium transition-colors duration-[250ms]",
										compact ? "px-3" : "px-3.5",
										on ? fgText : subText,
										on ? (dark ? "bg-white/12" : "bg-[rgba(14,18,20,0.06)]") : dark ? "bg-transparent hover:text-white" : "bg-transparent hover:text-[#0e1214]",
									)}
								>
									{link.label}
								</Link>
							);
						})}
					</div>
				) : null}

				{isArticleReading ? (
					<div className={cn("hidden min-w-0 flex-1 items-center justify-center gap-2 text-sm", bp.flex, subText)}>
						<span className={cn("block h-1.5 w-1.5 flex-none rounded-full", heading ? "bg-[#ffb900]" : dark ? "bg-white/30" : "bg-[#c9d1d4]")} />
						<span className="flex-none font-medium">{heading ? "Lendo" : "Neste artigo"}</span>
						<span className="min-w-0 truncate">{heading ?? ""}</span>
					</div>
				) : null}

				<div className="flex flex-none items-center gap-1">
					{!compact ? (
						<Link href="/auth/signin" className={cn("hidden h-10 items-center whitespace-nowrap px-3.5 text-sm font-medium", bp.inline, subText)}>
							Entrar
						</Link>
					) : null}
					<Link
						href={cta.href}
						target={ctaIsExternal ? "_blank" : undefined}
						rel={ctaIsExternal ? "noopener noreferrer" : undefined}
						onClick={() =>
							captureClientEvent({
								event: "landing_cta_clicked",
								controlEvent: ctaIsExternal ? "contact" : undefined,
								properties: { cta_id: `dock_${variant}_${active ?? "default"}`, location: "navbar" },
							})
						}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition-[background-color,color,height] duration-300",
							compact ? "h-11 px-4 sm:px-[18px]" : "h-10 px-3.5 sm:px-4",
							dark ? "bg-white text-[#0b1628]" : "bg-[#0e1214] text-white",
						)}
					>
						<span className="whitespace-nowrap sm:hidden">{cta.short}</span>
						<span className="hidden whitespace-nowrap sm:inline">{cta.label}</span>
						{compact ? <ArrowRight className={cn("hidden h-3.5 w-3.5", bp.block)} /> : null}
					</Link>
					{links.length > 0 ? (
						<button
							type="button"
							onClick={() => setMenuOpen((o) => !o)}
							aria-label="Menu"
							aria-expanded={menuOpen}
							className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-transparent", bp.hide, fgText)}
						>
							{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
						</button>
					) : null}
				</div>
			</nav>

			{menuOpen ? (
				<div
					className={cn(
						"pointer-events-auto mt-2 flex w-full max-w-[560px] flex-col gap-0.5 rounded-3xl border p-2 backdrop-blur-[16px] backdrop-saturate-[1.6]",
						bp.hide,
						glass,
					)}
				>
					{links.map((link) => {
						const href = link.href ?? sectionHref(link.id);
						const on = !!link.id && link.id === active && !link.href;
						return (
							<Link
								key={href}
								href={href}
								onClick={() => handleNavClick(href, true)}
								className={cn(
									"flex h-11 items-center rounded-xl px-3.5 text-base font-medium",
									on ? fgText : subText,
									on ? (dark ? "bg-white/10" : "bg-[#f2f4f4]") : "bg-transparent",
								)}
							>
								{link.label}
							</Link>
						);
					})}
					<Link
						href="/auth/signin"
						onClick={() => setMenuOpen(false)}
						className={cn(
							"mt-1 flex h-11 items-center rounded-xl border-t px-3.5 text-base font-medium",
							subText,
							dark ? "border-white/10" : "border-[#e3e8ea]",
						)}
					>
						Entrar
					</Link>
				</div>
			) : null}
		</div>
	);
}

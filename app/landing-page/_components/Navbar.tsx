"use client";

import { cn } from "@/lib/utils";
import LogoCompleteHorizontalColorful from "@/utils/svgs/logos/RECOMPRA - COMPLETE - HORIZONTAL- COLORFUL TEXT-BLACK.svg";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const NAV_LINKS = [
	{ label: "Funcionalidades", href: "#funcionalidades" },
	{ label: "Perguntas", href: "#perguntas" },
	{ label: "Planos", href: "#planos" },
];

export default function Navbar() {
	const [scrolled, setScrolled] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 20);
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const handleAnchorClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
		e.preventDefault();
		setMobileOpen(false);
		const el = document.querySelector(href);
		if (el) el.scrollIntoView({ behavior: "smooth" });
	}, []);

	return (
		<header
			className={cn(
				"fixed top-0 left-0 right-0 z-50 transition-all duration-300",
				scrolled ? "bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm" : "bg-transparent",
			)}
		>
			<div className="container mx-auto max-w-7xl px-6 lg:px-8 h-16 flex items-center justify-between">
				{/* Logo */}
				<Link href="/landing-page" className="relative w-36 h-10">
					<Image src={LogoCompleteHorizontalColorful} alt="RecompraCRM" fill className="object-contain" priority />
				</Link>

				{/* Desktop nav */}
				<nav className="hidden md:flex items-center gap-8">
					{NAV_LINKS.map((link) => (
						<a
							key={link.href}
							href={link.href}
							onClick={(e) => handleAnchorClick(e, link.href)}
							className="text-sm font-medium text-slate-600 hover:text-[#24549C] transition-colors"
						>
							{link.label}
						</a>
					))}
				</nav>

				{/* Right actions */}
				<div className="hidden md:flex items-center gap-4">
					<Link href="/auth/signin" className="text-sm font-medium text-slate-600 hover:text-[#24549C] transition-colors">
						Entrar
					</Link>
					<Link
						href="/auth/signup"
						target="_blank"
						rel="noopener noreferrer"
						className="bg-[#24549C] hover:bg-[#1e4682] text-white text-sm font-bold px-6 py-2.5 rounded-full shadow-lg shadow-blue-900/15 hover:shadow-blue-900/25 hover:-translate-y-0.5 transition-all duration-300"
					>
						Cadastrar
					</Link>
				</div>

				{/* Mobile menu button */}
				<button type="button" className="md:hidden p-2 text-slate-700" onClick={() => setMobileOpen(!mobileOpen)}>
					{mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
				</button>
			</div>

			{/* Mobile menu */}
			{mobileOpen && (
				<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="md:hidden bg-white border-b border-slate-200 shadow-lg">
					<div className="container mx-auto max-w-7xl px-6 py-4 flex flex-col gap-4">
						{NAV_LINKS.map((link) => (
							<a key={link.href} href={link.href} onClick={(e) => handleAnchorClick(e, link.href)} className="text-sm font-medium text-slate-700 py-2">
								{link.label}
							</a>
						))}
						<hr className="border-slate-200" />
						<Link href="/auth/signin" className="text-sm font-medium text-slate-600 py-2">
							Entrar
						</Link>
						<Link
							href="/auth/signup"
							target="_blank"
							rel="noopener noreferrer"
							className="bg-[#24549C] text-white text-sm font-bold px-6 py-3 rounded-full text-center"
						>
							Cadastrar
						</Link>
					</div>
				</motion.div>
			)}
		</header>
	);
}

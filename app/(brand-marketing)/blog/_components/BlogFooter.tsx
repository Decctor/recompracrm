import { BrandLogo } from "@/components/Brand/BrandLogo";
import Link from "next/link";

const LINKS = [
	{ label: "Produto", href: "/" },
	{ label: "ERP", href: "/erp" },
	{ label: "Blog", href: "/blog" },
	{ label: "Segmentos", href: "/segmentos" },
	{ label: "Integrações", href: "/integrations" },
	{ label: "Privacidade", href: "/legal" },
];

// Ano do build: a página é estática, e o rodapé muda de ano no deploy seguinte.
const YEAR = new Date().getFullYear();

// Rodapé enxuto do blog (o do design): logo, links e direitos numa linha. O CTA de conversão já está
// no cartão do artigo; repetir o bloco azul do `FooterV2` aqui duplicaria o convite.
export function BlogFooter() {
	return (
		<footer className="border-t border-[#e3e8ea] bg-white">
			<div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-6 pt-14 pb-10">
				<Link href="/" aria-label="RecompraCRM">
					<BrandLogo lockup="horizontal-badge" tone="color-on-light" className="block h-6 w-auto" />
				</Link>
				<nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
					{LINKS.map((link) => (
						<Link key={link.href} href={link.href} className="text-[#5b6a70] transition-colors hover:text-[#0e1214]">
							{link.label}
						</Link>
					))}
				</nav>
				<span className="text-[13px] text-[#8a979c]">© {YEAR} RecompraCRM</span>
			</div>
		</footer>
	);
}

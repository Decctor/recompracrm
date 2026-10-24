import { BrandLogo } from "@/components/Brand/BrandLogo";
import { cn } from "@/lib/utils";
import Link from "next/link";

const LINKS = [
	{ label: "Produto", href: "/" },
	{ label: "Funcionalidades", href: "/features/programa-de-cashback" },
	{ label: "Cases", href: "/cases" },
	{ label: "Integrações", href: "/integrations" },
	{ label: "ERP", href: "/erp" },
	{ label: "Ferramentas", href: "/tools/cashback-calculator" },
	{ label: "Blog", href: "/blog" },
	{ label: "Ajuda", href: "/help" },
	{ label: "Segmentos", href: "/segments" },
	{ label: "Privacidade", href: "/legal" },
];

// Ano do build: a página é estática, e o rodapé muda de ano no deploy seguinte.
const YEAR = new Date().getFullYear();

// Rodapé enxuto das páginas de marketing: logo, links e direitos numa linha. O convite à conversão
// fica no CTA de cada página; repetir o bloco azul do `FooterV2` aqui duplicaria o convite.
// `bordered` traça a linha de cima, para páginas cuja última seção também é branca.
export function MarketingFooter({ bordered = true }: { bordered?: boolean }) {
	return (
		<footer className={cn("bg-white", bordered && "border-t border-[#e3e8ea]")}>
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

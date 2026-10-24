import { BrandLogo } from "@/components/Brand/BrandLogo";
import Link from "next/link";

const GROUPS = [
	{
		title: "Produto",
		links: [
			{ label: "Fidelização", href: "/features/programa-de-cashback" },
			{ label: "Recuperação", href: "/features/campanhas-whatsapp" },
			{ label: "Ponto de Interação", href: "/features/ponto-de-interacao" },
			{ label: "ERP", href: "/erp" },
			{ label: "Planos", href: "/#planos" },
		],
	},
	{
		title: "Conteúdo",
		links: [
			{ label: "Blog", href: "/blog" },
			{ label: "Segmentos", href: "/segmentos" },
			{ label: "Integrações", href: "/integrations" },
			{ label: "Parcerias", href: "/partnerships" },
		],
	},
	{
		title: "Conta e legal",
		links: [
			{ label: "Entrar", href: "/auth/signin" },
			{ label: "Criar conta", href: "/auth/signup" },
			{ label: "Termos de uso", href: "/legal" },
			{ label: "Privacidade", href: "/legal" },
		],
	},
];

export function ErpFooter() {
	return (
		<footer className="bg-white">
			<div className="mx-auto max-w-[1240px] px-6 pt-[72px] pb-10 max-md:px-4">
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-8 pb-12">
					<div className="col-span-2 min-w-0 max-w-[360px] max-[403px]:col-span-1">
						<BrandLogo lockup="horizontal-badge" tone="color-on-light" className="block h-[26px] w-auto object-contain object-left" />
						<p className="mt-4 text-[14px] leading-[1.6] text-[#687a80]">
							CRM de fidelização e recuperação de clientes para o varejo brasileiro, com ERP próprio para quem quer tudo em um sistema.
						</p>
					</div>
					{GROUPS.map((group) => (
						<div key={group.title}>
							<p className="mb-3.5 text-[13px] font-semibold">{group.title}</p>
							<ul className="flex list-none flex-col gap-2.5 p-0">
								{group.links.map((link) => (
									<li key={link.label}>
										<Link href={link.href} className="text-[14px] text-[#687a80] transition-colors hover:text-[#24549c]">
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
				<div className="flex flex-wrap justify-between gap-3 border-t border-[#e3e8ea] pt-6 text-[13px] text-[#8a979c]">
					<span>© 2026 RecompraCRM</span>
					<span>LGPD · Pagamento via Stripe · Suporte humano</span>
				</div>
			</div>
		</footer>
	);
}

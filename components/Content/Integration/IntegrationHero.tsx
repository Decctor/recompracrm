import type { IntegrationPage } from "@/app/_content/integration-pages";
import { BrandLogo } from "@/components/Brand/BrandLogo";
import { ArrowRight, Check, ChevronRight, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { CategoryChip, IntegrationLogo } from "./IntegrationCard";
import { getEntityIcon } from "./integration-icons";
import { buildWhatsappUrl } from "./links";
import { TrackedLink } from "./TrackedLink";

type IntegrationHeroProps = {
	page: IntegrationPage;
};

// Topo da página de uma integração: trilha, par de logos, chamada e o painel "conectado" com o
// que a integração importa.
export function IntegrationHero({ page }: IntegrationHeroProps) {
	return (
		<header id="top" className="pt-[120px] sm:pt-[152px]">
			<div className="mx-auto max-w-[1240px] px-6">
				<nav aria-label="Trilha" className="mb-10 flex items-center gap-2 text-sm leading-[normal] sm:mb-12">
					<Link href="/integrations" className="font-medium text-[#0e1214] hover:text-[#24549c]">
						Integrações
					</Link>
					<ChevronRight className="size-3.5 flex-none text-[#c9d1d4]" aria-hidden />
					<span aria-current="page" className="text-[#687a80]">
						{page.name}
					</span>
				</nav>

				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-14">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2.5">
							<IntegrationLogo integration={page} className="size-14 p-[11px]" />
							<Plus className="size-4 flex-none text-[#9aa6ab]" aria-hidden />
							<span className="flex size-14 flex-none items-center justify-center rounded-full bg-[#0b1628] p-2">
								<span className="relative size-full">
									<BrandLogo lockup="icon-badge" tone="color" alt="RecompraCRM" fill className="object-contain" />
								</span>
							</span>
							<span className="ml-2">
								<CategoryChip>{page.category}</CategoryChip>
							</span>
						</div>

						<h1 className="m-0 mt-7 text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-balance sm:text-[48px] lg:text-[56px] lg:leading-[1.03]">
							{page.tagline}
						</h1>
						<p className="m-0 mt-5 max-w-[560px] text-[17px] leading-[1.6] text-[#5b6a70] text-pretty sm:text-lg">{page.heroSubtitle}</p>

						<div className="mt-7 flex flex-wrap gap-2.5">
							<TrackedLink
								href={buildWhatsappUrl(page.cta.whatsappMessage)}
								ctaId="integration_demo"
								location="hero"
								page={`integration_${page.slug}`}
								className="inline-flex h-[46px] items-center gap-2 whitespace-nowrap rounded-full bg-[#0e1214] px-[22px] text-[15px] font-medium text-white transition-colors hover:bg-[#24549c]"
							>
								{page.cta.buttonText}
								<ArrowRight className="size-4" aria-hidden />
							</TrackedLink>
							<a
								href="#importa"
								className="inline-flex h-[46px] items-center whitespace-nowrap rounded-full border border-[#e3e8ea] px-[22px] text-[15px] font-medium text-[#0e1214] transition-colors hover:bg-[#f6f8f9]"
							>
								O que importamos
							</a>
						</div>

						<p className="m-0 mt-6 flex items-center gap-2 text-sm leading-[1.4] text-[#5b6a70]">
							<ShieldCheck className="size-4 flex-none text-[#16a34a]" aria-hidden />
							{page.connectionSummary}
						</p>
					</div>

					<ConnectedPanel page={page} />
				</div>
			</div>
		</header>
	);
}

// Recorte ilustrativo do conector já ligado: uma linha por grupo de dados importados.
function ConnectedPanel({ page }: { page: IntegrationPage }) {
	return (
		<div className="min-w-0 rounded-[28px] bg-[#eef2f6] p-4 sm:p-10" aria-hidden>
			<div className="overflow-hidden rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]">
				<div className="flex items-center justify-between gap-3 border-b border-[#e3e8ea] px-[18px] py-4">
					<div className="flex min-w-0 items-center gap-2.5">
						<IntegrationLogo integration={page} decorative className="size-8 p-1.5" />
						<span className="truncate text-[15px] font-bold leading-[normal] tracking-[-0.015em]">{page.name}</span>
					</div>
					<span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-semibold leading-[normal] text-[#15803d]">
						<span className="size-1.5 rounded-full bg-[#16a34a]" />
						CONECTADO
					</span>
				</div>
				<div className="flex flex-col">
					{page.whatWeImport.map((group) => {
						const Icon = getEntityIcon(group.entity);
						return (
							<div key={group.entity} className="flex items-center gap-3 border-b border-[#f2f4f4] px-[18px] py-3.5">
								<span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-[rgba(36,84,156,0.1)] text-[#24549c]">
									<Icon className="size-4" />
								</span>
								<div className="min-w-0 flex-1">
									<p className="m-0 text-sm font-bold leading-[normal]">{group.entity}</p>
									<p className="m-0 mt-0.5 truncate text-xs leading-[normal] text-[#687a80]">{group.items.join(" · ")}</p>
								</div>
								<span className="inline-flex flex-none items-center gap-1 whitespace-nowrap text-xs font-semibold leading-[normal] text-[#15803d]">
									<Check className="size-3.5" />
									<span className="hidden min-[380px]:inline">Sincronizado</span>
								</span>
							</div>
						);
					})}
				</div>
				<div className="flex items-center gap-2 bg-[#f7f9f9] px-[18px] py-3 text-xs leading-[normal] text-[#687a80]">
					<RefreshCcw className="size-3.5" />
					Sincronização automática
				</div>
			</div>
		</div>
	);
}

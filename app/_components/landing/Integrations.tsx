import { TrackedLink } from "@/app/_components/ledger/TrackedLink";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { LANDING_INTEGRATIONS } from "./integrations-data";
import { Container, Eyebrow, SectionLead, SectionTitle } from "./primitives";

export function LandingIntegrations() {
	return (
		<section id="integracoes" className="bg-white py-24 sm:py-[136px]">
			<Container className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-start gap-12">
				<div>
					<Eyebrow>05 · Integrações</Eyebrow>
					<SectionTitle>Seus dados entram sozinhos.</SectionTitle>
					<SectionLead>
						Vendas, clientes e produtos importados a cada poucos minutos. Cancelamentos revertem o cashback. Ninguém digita nada duas vezes.
					</SectionLead>
					<TrackedLink
						href="/integrations"
						event="landing_integrations_view_all"
						properties={{ location: "landing_integrations" }}
						className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#24549c] hover:text-[#1a3d7a]"
					>
						Ver todas as integrações
						<ArrowRight className="h-4 w-4" aria-hidden />
					</TrackedLink>
				</div>
				<div className="overflow-hidden rounded-xl border border-[#e3e8ea] bg-white">
					{LANDING_INTEGRATIONS.map((integration) => (
						<TrackedLink
							key={integration.slug}
							href={`/integrations/${integration.slug}`}
							event="landing_integration_click"
							properties={{ integration: integration.slug, location: "landing_integrations" }}
							className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 border-b border-[#eef1f2] px-5 py-4 text-[#0e1214] transition-colors last:border-b-0 hover:bg-[#f7f8fa]"
						>
							<span className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e3e8ea] p-1.5">
								<Image src={integration.logo} alt="" className="h-full w-full object-contain" sizes="40px" />
							</span>
							<span className="min-w-0">
								<span className="block text-[15px] font-semibold">{integration.name}</span>
								<span className="mt-0.5 block text-[13px] text-[#687a80]">{integration.pitch}</span>
							</span>
							<span className="rounded-md bg-[#f5f5f5] px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap text-[#5b6a70]">
								{integration.category}
							</span>
						</TrackedLink>
					))}
				</div>
			</Container>
		</section>
	);
}

import type { SegmentPage } from "@/app/_content/segment-pages";
import { ArrowRight, Check, Coins, Minus } from "lucide-react";
import Link from "next/link";
import { lightSurface, SEGMENT_FAMILY_THEMES } from "./segment-families";

const CONTAINER = "mx-auto max-w-[1240px] px-6";
const CARD =
	"flex flex-col gap-4 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)] max-md:p-4";

/**
 * "Sistema para …": o lado ERP do segmento. Onde o ERP cobre o segmento inteiro, mostra os
 * módulos que ele usa; onde o segmento exige um sistema do setor, mostra com clareza o que fica
 * nesse sistema e o que o RecompraCRM faz junto com ele. Conteúdo em app/_content/segment-erp.ts.
 */
export function SegmentErp({ page }: { page: SegmentPage }) {
	const theme = SEGMENT_FAMILY_THEMES[page.family];
	const erp = page.erp;
	const complete = erp.fit === "COMPLETO";
	const eyebrowColor = theme.dark ? "#24549c" : theme.accent;

	return (
		<section id="sistema" className="scroll-mt-[60px] pt-[120px] max-md:pt-20">
			<div className={`${CONTAINER} grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-x-[72px] gap-y-10`}>
				<div>
					<p className="text-[13px] font-semibold" style={{ color: eyebrowColor }}>
						{complete ? `ERP para ${page.name}` : "Com o sistema que você já usa"}
					</p>
					<h2 className="mt-3.5 text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance max-md:text-[32px]">{erp.headline}</h2>
					<p className="mt-4 text-[16px] leading-[1.6] text-pretty text-[#5b6a70]">{erp.intro}</p>
					{erp.staysInCurrentSystem && complete ? <p className="mt-3 text-[14px] leading-[1.55] text-[#687a80]">{erp.staysInCurrentSystem}</p> : null}
					<div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium">
						{complete ? (
							<>
								<Link href="/erp/pdv" className="inline-flex items-center gap-1.5 text-[#24549c] hover:underline">
									Conhecer o PDV
									<ArrowRight className="size-4 flex-none" aria-hidden />
								</Link>
								<Link href="/erp" className="inline-flex items-center gap-1.5 text-[#0e1214] hover:underline">
									Ver o ERP completo
								</Link>
							</>
						) : (
							<>
								<Link href="/features/ponto-de-interacao" className="inline-flex items-center gap-1.5 text-[#24549c] hover:underline">
									Como funciona o Ponto de Interação
									<ArrowRight className="size-4 flex-none" aria-hidden />
								</Link>
								<Link href="/integrations" className="inline-flex items-center gap-1.5 text-[#0e1214] hover:underline">
									Ver integrações
								</Link>
							</>
						)}
					</div>
				</div>

				<div className="min-w-0 rounded-[28px] p-9 max-md:rounded-[22px] max-md:p-3" style={{ background: lightSurface(theme) }}>
					{complete ? <CompleteCard page={page} /> : <SideBySideCard page={page} />}
				</div>
			</div>
		</section>
	);
}

function CompleteCard({ page }: { page: SegmentPage }) {
	return (
		<div className={CARD}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-[20px] font-extrabold tracking-[-0.025em]">ERP RecompraCRM</span>
				<span className="inline-flex items-center rounded-full bg-[#eef2f6] px-2 py-0.5 text-[11px] font-bold text-[#24549c]">PDV · NOTA · ESTOQUE</span>
			</div>
			<ul className="flex list-none flex-col gap-2 p-0">
				{page.erp.modules.map((item) => (
					<li key={item} className="flex items-start gap-2.5 rounded-xl border border-[#e3e8ea] px-3 py-3 text-[14px] leading-[1.45]">
						<Check className="mt-0.5 size-4 flex-none text-[#16a34a]" aria-hidden />
						{item}
					</li>
				))}
			</ul>
			<div className="flex items-center gap-2.5 rounded-xl bg-[#fff7e5] px-3 py-3 text-[14px] leading-[1.45] text-[#7a5117]">
				<Coins className="size-4 flex-none" aria-hidden />
				Cashback creditado na mesma venda, sem integração no meio
			</div>
		</div>
	);
}

function SideBySideCard({ page }: { page: SegmentPage }) {
	return (
		<div className={`${CARD} gap-3`}>
			<div className="flex flex-col gap-1.5 rounded-xl bg-[#f2f4f4] px-4 py-3.5">
				<span className="text-[11px] font-bold tracking-[0.04em] text-[#687a80]">FICA NO SEU SISTEMA</span>
				<p className="flex items-start gap-2 text-[14px] leading-[1.45] text-[#2b3538]">
					<Minus className="mt-0.5 size-4 flex-none text-[#8a979c]" aria-hidden />
					{page.erp.staysInCurrentSystem}
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<span className="text-[11px] font-bold tracking-[0.04em] text-[#24549c]">NO RECOMPRACRM</span>
				<ul className="flex list-none flex-col gap-2 p-0">
					{page.erp.modules.map((item) => (
						<li key={item} className="flex items-start gap-2.5 rounded-xl border border-[#e3e8ea] px-3 py-3 text-[14px] leading-[1.45]">
							<Check className="mt-0.5 size-4 flex-none text-[#16a34a]" aria-hidden />
							{item}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

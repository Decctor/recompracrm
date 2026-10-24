import type { TLandingCase } from "@/app/_content/cases";
import { ArrowUpRight, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CaseLogo, CaseMetricValue } from "./CaseParts";
import { caseHref, caseKindLabel, casePlace, caseThumbnail, caseTitle } from "./case-format";

/** Cartão do índice /cases: capa do vídeo, cliente e as duas primeiras métricas. */
export function CaseCard({ item }: { item: TLandingCase }) {
	const thumbnail = caseThumbnail(item, 960);
	return (
		<Link
			href={caseHref(item)}
			className="group flex flex-col overflow-hidden rounded-[28px] border border-[rgba(14,18,20,0.08)] bg-white text-[#0e1214] transition-[box-shadow,transform] duration-[350ms] hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-36px_rgba(16,24,40,0.45)] max-md:rounded-[22px]"
		>
			<div className="relative aspect-video overflow-hidden bg-[#0b1628]">
				{thumbnail ? (
					<Image
						src={thumbnail}
						alt={`Depoimento em vídeo de ${item.client.name}`}
						fill
						unoptimized
						sizes="(max-width: 1040px) 100vw, 600px"
						className="object-cover"
					/>
				) : null}
				<span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.7),rgba(0,0,0,0.1)_55%,rgba(0,0,0,0.05))]" aria-hidden />
				{item.video ? (
					<span
						className="absolute top-1/2 left-1/2 flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffb900] text-[#171717] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-105"
						aria-hidden
					>
						<Play className="ml-[3px] h-[22px] w-[22px] fill-current" />
					</span>
				) : null}
				<span className="absolute right-5 bottom-[18px] left-5 flex flex-col gap-1">
					<span className="text-[11px] font-bold tracking-[0.14em] text-[#ffb900] uppercase">{caseKindLabel(item)}</span>
					<span className="text-[15px] leading-[1.35] font-semibold text-white">{caseTitle(item)}</span>
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-5 px-7 pt-6 pb-7 max-md:px-5 max-md:pb-6">
				<div className="flex items-center gap-3">
					<CaseLogo item={item} size="md" />
					<span className="min-w-0">
						<span className="block text-[18px] font-semibold tracking-[-0.015em]">{item.client.name}</span>
						<span className="block text-[13px] text-[#687a80]">{casePlace(item)}</span>
					</span>
				</div>
				{item.metrics.length > 0 ? (
					<div className="flex flex-wrap gap-x-10 gap-y-6 border-t border-[#eef1f2] pt-5">
						{item.metrics.slice(0, 2).map((metric) => (
							<div key={metric.label} className="flex max-w-[180px] flex-col gap-1">
								<CaseMetricValue metric={metric} size="card" />
								<span className="text-[13px] font-semibold">{metric.label}</span>
							</div>
						))}
					</div>
				) : null}
				<span className="mt-auto flex items-center justify-between text-[14px] font-medium text-[#5b6a70]">
					Ver o case
					<ArrowUpRight
						className="h-[18px] w-[18px] text-[#8a979c] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						aria-hidden
					/>
				</span>
			</div>
		</Link>
	);
}

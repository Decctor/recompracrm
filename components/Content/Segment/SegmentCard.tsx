import type { SegmentPage } from "@/app/_content/segment-pages";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SegmentCard({ segment }: { segment: SegmentPage }) {
	return (
		<Link
			href={`/segments/${segment.slug}`}
			className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#24549C]/30 hover:shadow-lg hover:shadow-slate-900/5"
		>
			<div className="flex items-center justify-between">
				<span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-3xl ring-1 ring-slate-100">{segment.emoji}</span>
				<span className="rounded-full bg-blue-50 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-[#24549C]">Segmento</span>
			</div>
			<h3 className="mt-5 text-lg font-black tracking-tight text-slate-900">{segment.name}</h3>
			<p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{segment.heroSubtitle}</p>
			<span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#24549C]">
				Ver como funciona
				<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
			</span>
		</Link>
	);
}

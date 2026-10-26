"use client";

import { LANDING_CASES, type TCaseMetric, type TLandingCase } from "@/app/_content/cases";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";

// O MuxPlayer só é baixado quando o visitante clica no play — até lá a landing carrega
// apenas a thumbnail (servida pela CDN de imagens do Mux).
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

const numberFormat = new Intl.NumberFormat("pt-BR");

function formatMetric(metric: TCaseMetric) {
	const value = metric.decimals
		? metric.value.toLocaleString("pt-BR", { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals })
		: numberFormat.format(metric.value);
	const prefix = metric.prefix ? (metric.prefix.endsWith("R$") ? `${metric.prefix} ` : metric.prefix) : "";
	return `${prefix}${value}${metric.suffix ?? ""}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function attribution(item: TLandingCase) {
	const { client, quote } = item;
	if (quote?.author) return [quote.author, quote.role, client.name].filter(Boolean).join(" · ");
	return `${client.name} · ${client.city}/${client.state}`;
}

function CaseLogo({ item, size }: { item: TLandingCase; size: "sm" | "lg" }) {
	const box = size === "sm" ? "h-6 w-6 rounded-md p-0.5" : "h-10 w-10 shrink-0 rounded-[10px] p-1";
	return (
		<span className={cn("flex items-center justify-center overflow-hidden border border-[#e3e8ea] bg-white", box)}>
			{item.client.logoSrc ? (
				<Image
					src={item.client.logoSrc}
					alt={size === "lg" ? `Logo ${item.client.name}` : ""}
					width={size === "sm" ? 24 : 40}
					height={size === "sm" ? 24 : 40}
					className="h-full w-full object-contain"
				/>
			) : (
				<span className="text-[10px] font-bold text-[#24549c]">{item.client.name.slice(0, 2).toUpperCase()}</span>
			)}
		</span>
	);
}

function CaseVideo({ item }: { item: TLandingCase }) {
	const [playing, setPlaying] = useState(false);
	const video = item.video;
	if (!video) return null;
	const thumbnail = `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?time=${video.thumbnailTime ?? 0}&width=960`;

	return (
		<div className="relative aspect-video overflow-hidden rounded-[10px] bg-[#0e1214]">
			{playing ? (
				<MuxPlayer
					streamType="on-demand"
					playbackId={video.muxPlaybackId}
					metadata={{ video_title: video.title }}
					accentColor="#24549c"
					autoPlay
					style={{ width: "100%", height: "100%", aspectRatio: "16/9" }}
				/>
			) : (
				<button type="button" onClick={() => setPlaying(true)} aria-label={`Assistir: ${video.title}`} className="group absolute inset-0 cursor-pointer">
					{/* eslint-disable-next-line @next/next/no-img-element -- thumbnail externa da CDN do Mux */}
					<img
						src={thumbnail}
						alt={`Vídeo de ${item.client.name}`}
						loading="lazy"
						className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					/>
					<span className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.6),rgba(0,0,0,0)_55%)]" aria-hidden />
					<span className="absolute top-5 left-5 flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#0e1214] transition-transform duration-300 group-hover:scale-105">
						<Play className="ml-0.5 h-[18px] w-[18px] fill-current" aria-hidden />
					</span>
					<span className="absolute right-5 bottom-[18px] left-5 text-left text-[14px] font-semibold leading-[1.35] text-white">{video.title}</span>
				</button>
			)}
		</div>
	);
}

export function CaseShowcase() {
	const [activeId, setActiveId] = useState(LANDING_CASES[0]?.id);
	const active = LANDING_CASES.find((c) => c.id === activeId) ?? LANDING_CASES[0];
	if (!active) return null;

	return (
		<>
			<div className="mb-10 flex flex-wrap items-end justify-between gap-6">
				<div className="max-w-[640px]">
					<p className="mb-4 text-[13px] font-semibold text-[#24549c]">04 · Resultado</p>
					<h2 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[48px]">Lojas reais, com nome, cidade e número.</h2>
				</div>
				<div className="flex flex-wrap gap-2" role="tablist" aria-label="Cases de clientes">
					{LANDING_CASES.map((item) => {
						const on = item.id === active.id;
						return (
							<button
								key={item.id}
								type="button"
								role="tab"
								aria-selected={on}
								onClick={() => setActiveId(item.id)}
								className={cn(
									"inline-flex cursor-pointer items-center gap-2 rounded-lg border py-1.5 pr-3.5 pl-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors",
									on ? "border-[#24549c] bg-[rgba(36,84,156,0.06)] text-[#24549c]" : "border-[#e3e8ea] bg-white text-[#5b6a70] hover:text-[#0e1214]",
								)}
							>
								<CaseLogo item={item} size="sm" />
								{item.client.name}
							</button>
						);
					})}
				</div>
			</div>

			<div
				role="tabpanel"
				className="overflow-hidden rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]"
			>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3e8ea] px-5 py-3.5 text-[13px] text-[#687a80] sm:px-7">
					<span className="flex items-center gap-3">
						<CaseLogo item={active} size="lg" />
						<span>
							<strong className="font-semibold text-[#0e1214]">{active.client.name}</strong> · {active.client.segment} · {active.client.city}/
							{active.client.state}
						</span>
					</span>
					{active.period ? <span>{active.period}</span> : null}
				</div>
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-center gap-10 px-5 py-9 sm:px-7">
					<div>
						<div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-7">
							{active.metrics.map((metric) => (
								<div key={metric.label} className="border-t-2 border-[#24549c] pt-3.5">
									<p className="text-[12px] font-semibold tracking-[0.04em] text-[#687a80] uppercase">{metric.label}</p>
									<p className="mt-2 text-[34px] font-bold leading-none tracking-[-0.02em] whitespace-nowrap text-[#0e1214]">{formatMetric(metric)}</p>
									<p className="mt-2.5 text-[13px] leading-[1.45] text-[#5b6a70]">{metric.description}</p>
								</div>
							))}
						</div>
						{active.quote ? (
							<blockquote className="mt-9 max-w-[56ch]">
								<p className="text-[18px] leading-[1.5] text-[#262626]">“{active.quote.text}”</p>
								<footer className="mt-3 text-[13px] text-[#687a80]">{attribution(active)}</footer>
							</blockquote>
						) : null}
					</div>
					<CaseVideo key={active.id} item={active} />
				</div>
			</div>
		</>
	);
}

"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// O MuxPlayer só é baixado quando o visitante clica no play — até lá a página carrega apenas a
// capa, servida pela CDN de imagens do Mux.
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

type CasePlayerProps = {
	caseId: string;
	playbackId: string;
	title: string;
	thumbnail: string;
	thumbnailAlt: string;
	kindLabel: string;
};

export function CasePlayer({ caseId, playbackId, title, thumbnail, thumbnailAlt, kindLabel }: CasePlayerProps) {
	const [playing, setPlaying] = useState(false);

	return (
		<div data-dock="dark" className="mt-14 rounded-[28px] bg-[#0b1628] p-3 max-md:mt-10 max-md:rounded-[20px] max-md:p-2">
			<div className="relative aspect-video overflow-hidden rounded-[20px] bg-black max-md:rounded-[14px]">
				{playing ? (
					<MuxPlayer
						streamType="on-demand"
						playbackId={playbackId}
						metadata={{ video_title: title }}
						accentColor="#ffb900"
						autoPlay
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
					/>
				) : (
					<button
						type="button"
						onClick={() => {
							setPlaying(true);
							captureClientEvent({ event: "case_video_played", properties: { case_id: caseId, location: "case_page" } });
						}}
						aria-label={`Assistir: ${title}`}
						className="group absolute inset-0 block h-full w-full cursor-pointer border-0 bg-black p-0"
					>
						{/* eslint-disable-next-line @next/next/no-img-element -- capa externa, já redimensionada pela CDN do Mux */}
						<img src={thumbnail} alt={thumbnailAlt} className="absolute inset-0 h-full w-full object-cover" />
						<span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.65),rgba(0,0,0,0.1)_50%,rgba(0,0,0,0.05))]" aria-hidden />
						<span
							className="absolute top-1/2 left-1/2 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffb900] text-[#171717] shadow-[0_14px_40px_-8px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-105 max-md:h-16 max-md:w-16"
							aria-hidden
						>
							<Play className="ml-1 h-[30px] w-[30px] fill-current max-md:h-6 max-md:w-6" />
						</span>
						<span className="absolute bottom-6 left-7 text-[12px] font-bold tracking-[0.14em] text-[#ffb900] uppercase max-md:bottom-3.5 max-md:left-4 max-md:text-[10px]">
							{kindLabel}
						</span>
					</button>
				)}
			</div>
		</div>
	);
}

"use client";

import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { cn } from "@/lib/utils";
import { Monitor, Smartphone, UtensilsCrossed } from "lucide-react";
import { type ReactNode, useState } from "react";

export type TErpChannel = "balcao" | "loja" | "mesas";

const CHANNELS = [
	{ id: "balcao", title: "Balcão", icon: Monitor },
	{ id: "loja", title: "Loja digital", icon: Smartphone },
	{ id: "mesas", title: "Mesas e comandas", icon: UtensilsCrossed },
] as const;

type ChannelTabsProps = {
	intro: ReactNode;
	panels: Record<TErpChannel, ReactNode>;
	defaultChannel?: TErpChannel;
};

// Só o estado da aba é client-side; os painéis (e as telas dentro deles) chegam prontos do servidor.
export function ChannelTabs({ intro, panels, defaultChannel = "balcao" }: ChannelTabsProps) {
	const [channel, setChannel] = useState<TErpChannel>(defaultChannel);

	return (
		<>
			<div className="flex flex-wrap items-end justify-between gap-8">
				{intro}
				<div role="tablist" aria-label="Canais de venda" className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-[#f2f4f4] p-1">
					{CHANNELS.map((item) => {
						const on = item.id === channel;
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								role="tab"
								id={`canal-tab-${item.id}`}
								aria-selected={on}
								aria-controls={`canal-panel-${item.id}`}
								onClick={() => {
									setChannel(item.id);
									captureClientEvent({ event: "erp_channel_selected", properties: { channel: item.id } });
								}}
								className={cn(
									"inline-flex h-10 flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border-0 px-[18px] text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200 max-[420px]:px-3.5",
									on
										? "bg-white text-[#0e1214] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_2px_8px_-2px_rgba(16,24,40,0.1)]"
										: "bg-transparent text-[#5b6a70] hover:text-[#0e1214]",
								)}
							>
								<Icon className="size-4 flex-none max-[420px]:hidden" aria-hidden />
								{item.title}
							</button>
						);
					})}
				</div>
			</div>

			<div className="mt-10 overflow-hidden rounded-[28px] bg-[#eef2f6] p-14 max-md:rounded-[20px] max-md:p-6 max-[420px]:p-5">
				{CHANNELS.map((item) => (
					<div key={item.id} role="tabpanel" id={`canal-panel-${item.id}`} aria-labelledby={`canal-tab-${item.id}`} hidden={channel !== item.id}>
						{panels[item.id]}
					</div>
				))}
			</div>
		</>
	);
}

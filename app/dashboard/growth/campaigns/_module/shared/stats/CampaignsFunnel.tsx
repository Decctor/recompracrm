"use client";
import { CampaignFunnelStages } from "@/components/Campaigns/CampaignFunnelStages";
import { formatDecimalPlaces } from "@/lib/formatting";
import { useCampaignFunnel } from "@/lib/queries/campaigns";

type CampaignsFunnelProps = {
	startDate: Date | null;
	endDate: Date | null;
};

export default function CampaignsFunnel({ startDate, endDate }: CampaignsFunnelProps) {
	const { data: funnel, isLoading } = useCampaignFunnel({
		startDate: startDate ?? undefined,
		endDate: endDate ?? undefined,
	});

	return (
		<div className="bg-card border-border flex min-h-0 w-full flex-col gap-4 rounded-xl border px-4 py-4 shadow-2xs lg:h-full">
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
				<h2 className="text-xs font-bold uppercase tracking-wide text-foreground">Funil de engajamento</h2>
				{funnel && (
					<div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-primary/10 text-foreground">
						{formatDecimalPlaces(funnel.taxaConversaoGeral)}% conversão geral
					</div>
				)}
			</div>

			{isLoading ? (
				<div className="flex min-h-48 flex-1 flex-col justify-between gap-3 lg:min-h-0">
					{[...Array(4)].map((_, i) => (
						<div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
					))}
				</div>
			) : funnel ? (
				<CampaignFunnelStages funnel={funnel} />
			) : (
				<p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Nenhum dado de funil disponível.</p>
			)}
		</div>
	);
}

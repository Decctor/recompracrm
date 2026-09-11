"use client";

import type { TGetCampaignFunnelOutput } from "@/app/api/campaigns/stats/funnel/route";
import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { CheckCircle2, Eye, MessageCircle, Send } from "lucide-react";

/**
 * As quatro etapas do funil de engajamento, sem moldura nem cabeçalho: quem chama decide o
 * contêiner. Extraído de `CampaignsFunnel` para que o dashboard mostre o mesmo funil da tela de
 * campanhas sem aninhar um card dentro de outro.
 */

export type TCampaignFunnel = TGetCampaignFunnelOutput["data"];

type FunnelStage = {
	label: string;
	sublabel: string;
	value: number;
	rate: number | null;
	icon: React.ReactNode;
	color: string;
	bgColor: string;
};

export function buildCampaignFunnelStages(funnel: TCampaignFunnel): FunnelStage[] {
	return [
		{
			label: "Enviadas",
			sublabel: "mensagens disparadas",
			value: funnel.enviados,
			rate: funnel.taxaEntrega,
			icon: <Send className="w-4 h-4" />,
			color: "#24549C",
			bgColor: "rgba(36,84,156,0.10)",
		},
		{
			label: "Entregues",
			sublabel: "chegaram ao cliente",
			value: funnel.entregues,
			rate: funnel.taxaLeitura,
			icon: <MessageCircle className="w-4 h-4" />,
			color: "#0ea5e9",
			bgColor: "rgba(14,165,233,0.10)",
		},
		{
			label: "Lidas",
			sublabel: "abertas pelo cliente",
			value: funnel.lidos,
			rate: funnel.taxaConversaoDeLidos,
			icon: <Eye className="w-4 h-4" />,
			color: "#FFB900",
			bgColor: "rgba(255,185,0,0.10)",
		},
		{
			label: "Convertidas",
			sublabel: "viraram compra",
			value: funnel.convertidos,
			rate: null,
			icon: <CheckCircle2 className="w-4 h-4" />,
			color: "#16a34a",
			bgColor: "rgba(22,163,74,0.10)",
		},
	];
}

type CampaignFunnelStagesProps = {
	funnel: TCampaignFunnel;
	/** "compact" esconde os sublabels e encurta as barras — cabe num widget do dashboard. */
	density?: "default" | "compact";
	className?: string;
};

export function CampaignFunnelStages({ funnel, density = "default", className }: CampaignFunnelStagesProps) {
	const stages = buildCampaignFunnelStages(funnel);
	const maxValue = Math.max(...stages.map((stage) => stage.value), 1);
	const compact = density === "compact";

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col justify-between", compact ? "gap-2" : "gap-4", className)}>
			{stages.map((stage, index) => {
				const widthPct = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
				const isLast = index === stages.length - 1;
				return (
					<div key={stage.label} className="flex flex-col gap-1.5">
						<div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
							<div className="flex items-center justify-center rounded-lg p-2 shrink-0" style={{ backgroundColor: stage.bgColor, color: stage.color }}>
								{stage.icon}
							</div>
							<div className="flex-1 flex flex-col gap-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0">
										<span className="text-xs font-bold uppercase tracking-tight">{stage.label}</span>
										{compact ? null : <span className="ml-1.5 text-[0.65rem] text-muted-foreground">{stage.sublabel}</span>}
									</div>
									<span className="text-sm font-bold tabular-nums shrink-0">{formatDecimalPlaces(stage.value)}</span>
								</div>
								<div className={cn("w-full rounded-lg overflow-hidden bg-muted/30", compact ? "h-4" : "h-6")}>
									<div
										className="h-full flex items-center justify-end pr-2 rounded-lg transition-all duration-500"
										style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
									>
										{widthPct > 12 ? <span className="text-[0.6rem] font-bold text-white">{Math.round(widthPct)}%</span> : null}
									</div>
								</div>
							</div>
						</div>
						{!isLast && stage.rate !== null ? (
							<div className={cn("flex items-center gap-1.5", compact ? "pl-10" : "pl-12")}>
								<div className="h-px flex-1 bg-border" />
								<span className="text-[0.65rem] text-muted-foreground px-2 shrink-0">{formatDecimalPlaces(stage.rate)}% avançam</span>
								<div className="h-px flex-1 bg-border" />
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

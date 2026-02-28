"use client";
import type { TGetCampaignFunnelInput } from "@/app/api/campaigns/stats/funnel/route";
import { formatDecimalPlaces } from "@/lib/formatting";
import { useCampaignFunnel } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle, Eye, MessageCircle, Send } from "lucide-react";

type CampaignsFunnelProps = {
	startDate: Date | null;
	endDate: Date | null;
};

export default function CampaignsFunnel({ startDate, endDate }: CampaignsFunnelProps) {
	const { data: funnelData, isLoading: funnelLoading } = useCampaignFunnel({
		startDate: startDate ?? undefined,
		endDate: endDate ?? undefined,
	});

	const stages = [
		{
			label: "Enviados",
			value: funnelData?.enviados ?? 0,
			icon: <Send className="w-5 h-5 min-w-5 min-h-5" />,
			color: "bg-blue-500",
			textColor: "text-blue-600 dark:text-blue-400",
			bgColor: "bg-blue-500/10",
		},
		{
			label: "Entregues",
			value: funnelData?.entregues ?? 0,
			icon: <MessageCircle className="w-5 h-5 min-w-5 min-h-5" />,
			color: "bg-green-500",
			textColor: "text-green-600 dark:text-green-400",
			bgColor: "bg-green-500/10",
			rate: funnelData?.taxaEntrega,
		},
		// Disabling Lidos for now as we dont have enough reliable data to show it
		// {
		// 	label: "Lidos",
		// 	value: funnelData?.lidos ?? 0,
		// 	icon: <Eye className="w-5 h-5 min-w-5 min-h-5" />,
		// 	color: "bg-yellow-500",
		// 	textColor: "text-yellow-600 dark:text-yellow-400",
		// 	bgColor: "bg-yellow-500/10",
		// 	rate: funnelData?.taxaLeitura,
		// },
		{
			label: "Convertidos",
			value: funnelData?.convertidos ?? 0,
			icon: <CheckCircle className="w-5 h-5 min-w-5 min-h-5" />,
			color: "bg-purple-500",
			textColor: "text-purple-600 dark:text-purple-400",
			bgColor: "bg-purple-500/10",
			rate: funnelData?.taxaConversaoDeLidos,
		},
	];

	const maxValue = Math.max(...stages.map((s) => s.value), 1);

	return (
		<div className="w-full flex flex-col gap-2 py-2 h-full">
			<div className="bg-card border-primary/20 flex w-full h-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
				<div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
					<h1 className="text-xs font-medium tracking-tight uppercase">FUNIL DE CONVERSÃO</h1>
					{funnelData && (
						<div className="flex items-center gap-1.5 rounded-md px-2 py-1 bg-primary/10">
							<span className="text-xs font-bold text-primary">{formatDecimalPlaces(funnelData.taxaConversaoGeral)}% taxa geral</span>
						</div>
					)}
				</div>
				<div className="flex w-full flex-1 flex-col gap-3 overflow-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 min-h-0 justify-center">
					{funnelLoading ? (
						<div className="flex w-full h-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Carregando funil...</p>
						</div>
					) : funnelData ? (
						<div className="flex flex-col gap-3 w-full">
							{stages.map((stage, index) => {
								const widthPercentage = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
								const isLast = index === stages.length - 1;

								return (
									<div key={stage.label} className="flex flex-col gap-1">
										<div className="flex items-center gap-3 w-full">
											<div className={cn("flex items-center justify-center rounded-lg p-2", stage.bgColor)}>
												<div className={stage.textColor}>{stage.icon}</div>
											</div>
											<div className="flex-1 flex flex-col gap-1">
												<div className="flex items-center justify-between gap-2">
													<span className="text-xs font-semibold uppercase tracking-tight">{stage.label}</span>
													<span className="text-xs font-bold">{formatDecimalPlaces(stage.value)}</span>
												</div>
												<div className="w-full h-8 bg-secondary/30 rounded-lg overflow-hidden relative">
													<div
														className={cn("h-full transition-all duration-500 flex items-center justify-end pr-2", stage.color)}
														style={{ width: `${widthPercentage}%` }}
													>
														{widthPercentage > 15 && <span className="text-xs font-bold text-white">{Math.round(widthPercentage)}%</span>}
													</div>
												</div>
											</div>
										</div>
										{!isLast && stage.rate !== undefined && (
											<div className="flex items-center gap-2 pl-16 py-1">
												<ArrowRight className="w-4 h-4 text-muted-foreground" />
												<span className="text-xs text-muted-foreground">{formatDecimalPlaces(stage.rate)}% converteram para próxima etapa</span>
											</div>
										)}
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex w-full h-full items-center justify-center">
							<p className="text-sm text-muted-foreground">Nenhum dado disponível para o período selecionado.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

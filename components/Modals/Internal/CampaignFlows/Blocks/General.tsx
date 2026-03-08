import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseCampaignFlowState } from "@/state-hooks/use-campaign-flow-state";
import { Archive, CalendarClock, CircleDot, LayoutGrid, Pause, Repeat, Zap } from "lucide-react";

type CampaignFlowGeneralBlockProps = {
	campaignFlow: TUseCampaignFlowState["state"]["campaignFlow"];
	updateCampaignFlow: TUseCampaignFlowState["updateCampaignFlow"];
};

const STATUS_OPTIONS = [
	{ value: "RASCUNHO", label: "Rascunho", icon: <CircleDot className="w-4 h-4" />, className: "border-muted-foreground/30 text-muted-foreground" },
	{ value: "ATIVO", label: "Ativo", icon: <Zap className="w-4 h-4" />, className: "border-green-500/30 text-green-600" },
	{ value: "PAUSADO", label: "Pausado", icon: <Pause className="w-4 h-4" />, className: "border-yellow-500/30 text-yellow-600" },
	{ value: "ARQUIVADO", label: "Arquivado", icon: <Archive className="w-4 h-4" />, className: "border-red-500/30 text-red-600" },
] as const;

const TYPE_OPTIONS = [
	{ value: "EVENTO", label: "Evento", description: "Disparado por evento (compra, aniversário, etc.)", icon: <Zap className="w-4 h-4" /> },
	{ value: "RECORRENTE", label: "Recorrente", description: "Disparado periodicamente (diário, semanal, mensal)", icon: <Repeat className="w-4 h-4" /> },
	{ value: "UNICA", label: "Única", description: "Disparado uma única vez manualmente", icon: <CalendarClock className="w-4 h-4" /> },
] as const;

export default function CampaignFlowGeneralBlock({ campaignFlow, updateCampaignFlow }: CampaignFlowGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="w-4 h-4" />}>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium tracking-tight text-primary/80">STATUS</span>
				<div className="flex flex-wrap gap-2">
					{STATUS_OPTIONS.map((option) => {
						const isSelected = campaignFlow.status === option.value;
						return (
							<Button
								key={option.value}
								type="button"
								variant="ghost"
								size="sm"
								className={cn("gap-1.5 px-3 py-1.5 rounded-lg border transition-colors", option.className, {
									"opacity-100": isSelected,
									"opacity-50 border-transparent hover:opacity-80": !isSelected,
								})}
								onClick={() => updateCampaignFlow({ status: option.value })}
							>
								{option.icon}
								<span className="text-xs font-medium">{option.label}</span>
							</Button>
						);
					})}
				</div>
			</div>

			<TextInput
				label="TÍTULO DO FLUXO"
				value={campaignFlow.titulo}
				placeholder="Ex: Boas-vindas após primeira compra..."
				handleChange={(value) => updateCampaignFlow({ titulo: value })}
				width="100%"
				required
			/>

			<TextareaInput
				label="DESCRIÇÃO"
				value={campaignFlow.descricao ?? ""}
				placeholder="Descreva o objetivo deste fluxo de campanha..."
				handleChange={(value) => updateCampaignFlow({ descricao: value || null })}
			/>

			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium tracking-tight text-primary/80">TIPO DE CAMPANHA</span>
				<div className="flex flex-col gap-2">
					{TYPE_OPTIONS.map((option) => {
						const isSelected = campaignFlow.tipo === option.value;
						return (
							<button
								key={option.value}
								type="button"
								className={cn(
									"flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
									isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
								)}
								onClick={() => updateCampaignFlow({ tipo: option.value })}
							>
								<div className={cn("mt-0.5", isSelected ? "text-primary" : "text-muted-foreground")}>{option.icon}</div>
								<div>
									<p className="text-sm font-medium">{option.label}</p>
									<p className="text-xs text-muted-foreground">{option.description}</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}

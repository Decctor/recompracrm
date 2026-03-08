import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TUseCampaignFlowState } from "@/state-hooks/use-campaign-flow-state";
import { DaysOfWeekOptions, InteractionsCronJobTimeBlocksOptions, RecurrenceFrequencyOptions } from "@/utils/select-options";
import { Repeat } from "lucide-react";

type RecurrenceConfigBlockProps = {
	campaignFlow: TUseCampaignFlowState["state"]["campaignFlow"];
	updateCampaignFlow: TUseCampaignFlowState["updateCampaignFlow"];
};

export default function RecurrenceConfigBlock({ campaignFlow, updateCampaignFlow }: RecurrenceConfigBlockProps) {
	if (campaignFlow.tipo !== "RECORRENTE") return null;

	const selectedDays = (campaignFlow.recorrenciaDiasSemana as number[] | null) ?? [];

	function toggleDayOfWeek(day: number) {
		const current = selectedDays;
		const newDays = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
		updateCampaignFlow({ recorrenciaDiasSemana: newDays });
	}

	return (
		<ResponsiveMenuSection title="CONFIGURAÇÃO DE RECORRÊNCIA" icon={<Repeat className="w-4 h-4" />}>
			<SelectInput
				label="FREQUÊNCIA"
				value={campaignFlow.recorrenciaTipo ?? null}
				options={RecurrenceFrequencyOptions.map((o) => ({ id: o.id, value: o.value, label: o.label }))}
				handleChange={(value) => updateCampaignFlow({ recorrenciaTipo: value as any })}
				onReset={() => updateCampaignFlow({ recorrenciaTipo: null })}
				resetOptionLabel="Selecione a frequência..."
				required
			/>

			<NumberInput
				label="INTERVALO (A CADA N PERÍODOS)"
				value={campaignFlow.recorrenciaIntervalo ?? 1}
				placeholder="1"
				handleChange={(value) => updateCampaignFlow({ recorrenciaIntervalo: value })}
			/>

			{campaignFlow.recorrenciaTipo === "SEMANAL" && (
				<div className="flex flex-col gap-2">
					<span className="text-sm font-medium tracking-tight text-primary/80">DIAS DA SEMANA</span>
					<div className="flex flex-wrap gap-1.5">
						{DaysOfWeekOptions.map((day) => {
							const isSelected = selectedDays.includes(day.value);
							return (
								<Button
									key={day.id}
									type="button"
									variant={isSelected ? "default" : "outline"}
									size="sm"
									className="text-xs"
									onClick={() => toggleDayOfWeek(day.value)}
								>
									{day.label.slice(0, 3)}
								</Button>
							);
						})}
					</div>
				</div>
			)}

			<SelectInput
				label="BLOCO DE HORÁRIO"
				value={campaignFlow.recorrenciaBlocoHorario ?? null}
				options={InteractionsCronJobTimeBlocksOptions.map((o) => ({ id: o.id, value: o.value, label: o.label }))}
				handleChange={(value) => updateCampaignFlow({ recorrenciaBlocoHorario: value as any })}
				onReset={() => updateCampaignFlow({ recorrenciaBlocoHorario: null })}
				resetOptionLabel="Selecione o horário..."
			/>
		</ResponsiveMenuSection>
	);
}

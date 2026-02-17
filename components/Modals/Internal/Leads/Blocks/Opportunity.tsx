import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TInternalLead } from "@/schemas/internal-leads";
import type { TUseInternalLeadState } from "@/state-hooks/use-internal-lead-state";
import { InternalLeadOriginOptions, InternalLeadProbabilityOptions } from "@/utils/select-options";
import { DollarSign } from "lucide-react";

type LeadsOpportunityBlockProps = {
	lead: TUseInternalLeadState["state"];
	updateLead: TUseInternalLeadState["updateLead"];
};

export default function LeadsOpportunityBlock({ lead, updateLead }: LeadsOpportunityBlockProps) {
	return (
		<ResponsiveMenuSection title="OPORTUNIDADE" icon={<DollarSign className="w-3.5 h-3.5" />}>
			<TextInput
				label="TÍTULO DA OPORTUNIDADE"
				placeholder="Preencha aqui o título da oportunidade..."
				value={lead.titulo ?? ""}
				handleChange={(v) => updateLead({ titulo: v })}
			/>
			<TextareaInput
				label="DESCRIÇÃO DA OPORTUNIDADE"
				placeholder="Preencha aqui a descrição da oportunidade..."
				value={lead.descricao ?? ""}
				handleChange={(v) => updateLead({ descricao: v })}
			/>
			<NumberInput
				label="VALOR ESTIMADO DE FECHAMENTO"
				placeholder="Preencha aqui o valor estimado da oportunidade..."
				value={lead.valor}
				handleChange={(v) => updateLead({ valor: v })}
			/>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium tracking-tight text-primary/80">PROBABILIDADE DE FECHAMENTO</span>
				<div className="flex flex-wrap gap-2">
					{InternalLeadProbabilityOptions.map((option) => {
						const isSelected = lead.probabilidade === option.value;
						return (
							<Button
								key={option.id}
								type="button"
								variant="ghost"
								size="fit"
								className={cn("gap-1.5 px-3 py-1.5 rounded-lg border transition-colors", option.className, {
									"opacity-100": isSelected,
									"opacity-50 border-transparent hover:opacity-80": !isSelected,
								})}
								onClick={() => updateLead({ probabilidade: option.value })}
							>
								{option.icon}
								<span className="text-xs font-medium">{option.label}</span>
								<span className="text-xs opacity-80">({option.value}%)</span>
							</Button>
						);
					})}
				</div>
			</div>
			<SelectInput
				label="ORIGEM DO LEAD"
				value={lead.origemLead ?? null}
				options={InternalLeadOriginOptions}
				resetOptionLabel="SEM ORIGEM"
				handleChange={(v) => updateLead({ origemLead: v as TInternalLead["origemLead"] })}
				onReset={() => updateLead({ origemLead: null })}
			/>
		</ResponsiveMenuSection>
	);
}

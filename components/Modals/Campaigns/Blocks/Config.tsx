import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { TimeDurationUnitsOptions } from "@/utils/select-options";
import { SettingsIcon } from "lucide-react";

type CampaignsConfigBlockProps = {
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
};
export default function CampaignsConfigBlock({ campaign, updateCampaign }: CampaignsConfigBlockProps) {
	return (
		<ResponsiveMenuSection title="CONFIGURAÇÕES" icon={<SettingsIcon className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-1">
				<p className="text-center text-sm tracking-tigh text-muted-foreground">Defina detalhes de configurações da campanha.</p>
				<CheckboxInput
					checked={!!campaign.permitirRecorrencia}
					labelTrue="PERMITIR RECORRÊNCIA"
					labelFalse="PERMITIR RECORRÊNCIA"
					handleChange={(value) => updateCampaign({ permitirRecorrencia: value })}
				/>

				{campaign.permitirRecorrencia ? (
					<div className="w-full flex flex-col gap-2 items-center lg:flex-row">
						<div className="w-full lg:w-1/2">
							<SelectInput
								label="FREQUÊNCIA DE INTERVALO (MEDIDA)"
								value={campaign.frequenciaIntervaloMedida}
								resetOptionLabel="SELECIONE A MEDIDA"
								options={TimeDurationUnitsOptions}
								handleChange={(value) => updateCampaign({ frequenciaIntervaloMedida: value as TTimeDurationUnitsEnum })}
								onReset={() => updateCampaign({ frequenciaIntervaloMedida: "DIAS" })}
								width="100%"
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="FREQUÊNCIA DE INTERVALO (VALOR)"
								value={campaign.frequenciaIntervaloValor ?? null}
								placeholder="Preencha aqui o valor do tempo de permanência..."
								handleChange={(value) => updateCampaign({ frequenciaIntervaloValor: value })}
								width="100%"
							/>
						</div>
					</div>
				) : null}
				{campaign.permitirRecorrencia && (!campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0) ? (
					<div className="w-full rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
						Defina uma frequência de intervalo maior que zero para evitar envios em toda execução da automação.
					</div>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}

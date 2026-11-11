import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { TimeDurationUnitsOptions } from "@/utils/select-options";
import { SettingsIcon } from "lucide-react";
import { type TWeeklySendUsage, WeeklySendLimitField } from "./weekly-send-limit-field";

type CampaignsConfigBlockProps = {
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
	/** Uso da semana, na edição de uma campanha que já envia. */
	weeklyUsage?: TWeeklySendUsage | null;
};
export default function CampaignsConfigBlock({ campaign, updateCampaign, weeklyUsage }: CampaignsConfigBlockProps) {
	return (
		<ResponsiveMenuSection title="CONFIGURAÇÕES" icon={<SettingsIcon className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-3">
				<p className="text-center text-sm tracking-tight text-muted-foreground">Defina detalhes de configurações da campanha.</p>
				<CheckboxInput
					checked={!!campaign.permitirRecorrencia}
					labelTrue="PERMITIR RECORRÊNCIA"
					labelFalse="PERMITIR RECORRÊNCIA"
					description="Define se o mesmo cliente pode receber esta campanha mais de uma vez. Com a opção ativa, configure o tempo mínimo entre um envio e outro para a mesma pessoa."
					handleChange={(value) => updateCampaign({ permitirRecorrencia: value })}
				/>

				{campaign.permitirRecorrencia ? (
					<>
						<p className="text-center text-sm tracking-tight text-muted-foreground">
							Mesmo que o gatilho dispare várias vezes para o mesmo cliente, enviamos no máximo uma mensagem dentro deste período. Depois desse intervalo,
							pode voltar a enviar se disparar de novo.
						</p>
						<div className="w-full flex flex-col gap-2 items-center lg:flex-row">
							<div className="w-full lg:w-1/2">
								<SelectInput
									label="INTERVALO MÍNIMO ENTRE ENVIOS — UNIDADE"
									value={campaign.frequenciaIntervaloMedida}
									resetOptionLabel="SELECIONE A MEDIDA"
									options={TimeDurationUnitsOptions}
									handleChange={(value) => updateCampaign({ frequenciaIntervaloMedida: value as TTimeDurationUnitsEnum })}
									onReset={() => updateCampaign({ frequenciaIntervaloMedida: "DIAS" })}
								/>
							</div>
							<div className="w-full lg:w-1/2">
								<NumberInput
									label="INTERVALO MÍNIMO ENTRE ENVIOS — QUANTIDADE"
									value={campaign.frequenciaIntervaloValor ?? null}
									placeholder="Ex.: 7 (use a medida ao lado — ex.: dias)"
									handleChange={(value) => updateCampaign({ frequenciaIntervaloValor: value })}
								/>
							</div>
						</div>
						{!campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0 ? (
							<div className="w-full rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
								Informe um intervalo maior que zero. Sem isso, cada vez que o gatilho rodar pode gerar novo envio ao mesmo cliente.
							</div>
						) : null}
					</>
				) : null}

				<WeeklySendLimitField
					value={campaign.limiteEnviosSemanais ?? null}
					onChange={(value) => updateCampaign({ limiteEnviosSemanais: value })}
					usage={weeklyUsage}
				/>
			</div>
		</ResponsiveMenuSection>
	);
}

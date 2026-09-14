import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { CampaignExecutionDelayDirectionOptions, InteractionsCronJobTimeBlocksOptions, TimeDurationUnitsOptions } from "@/utils/select-options";
import { PlayIcon } from "lucide-react";

const TRIGGERS_SUPPORTING_ANTES = ["ANIVERSARIO_CLIENTE", "PIOR-DIA-VENDAS"] as const;

type CampaignsExecutionBlockProps = {
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
	campaignSegmentations: TUseCampaignState["state"]["segmentations"];
};
export default function CampaignsExecutionBlock({
	campaign,
	updateCampaign,
	campaignSegmentations: _campaignSegmentations,
}: CampaignsExecutionBlockProps) {
	const isRecorrente = campaign.gatilhoTipo === "RECORRENTE";
	// Disparo único: a data vem do gatilho, então não há atraso de execução a configurar.
	const isUsoUnico = campaign.gatilhoTipo === "USO-UNICO" || campaign.gatilhoTipo === "PROMOCAO-PRODUTOS";
	const supportsAntes = (TRIGGERS_SUPPORTING_ANTES as readonly string[]).includes(campaign.gatilhoTipo);

	const intervalDescription =
		campaign.execucaoAgendadaDirecao === "ANTES"
			? "Informe quanto tempo antes da data do evento (por exemplo, do aniversário ou do dia previsto pelo gatilho) a mensagem deve entrar na fila de envio."
			: "Informe quanto tempo depois que o sistema identificar o cliente como elegível para este gatilho a mensagem deve entrar na fila de envio.";

	return (
		<ResponsiveMenuSection title="EXECUÇÃO" icon={<PlayIcon className="h-4 min-h-4 w-4 min-w-4" />}>
			{!isRecorrente && !isUsoUnico ? (
				<div className="w-full flex flex-col gap-3">
					<p className="text-center text-sm tracking-tight leading-snug text-muted-foreground">{intervalDescription}</p>
					<p className="text-center text-xs leading-snug text-muted-foreground">
						Use a unidade de tempo e o número para montar o intervalo — por exemplo, quantidade <strong className="font-medium text-foreground">2</strong>{" "}
						com unidade <strong className="font-medium text-foreground">DIAS</strong>
						{supportsAntes
							? " significa dois dias antes ou depois do evento, conforme a opção acima."
							: " significa dois dias após o gatilho considerar o cliente elegível."}
					</p>
					<div className="w-full flex flex-col items-center gap-2 lg:flex-row">
						{supportsAntes ? (
							<div className="w-full lg:w-1/3">
								<SelectInput
									label="ANTES OU DEPOIS DO EVENTO"
									value={campaign.execucaoAgendadaDirecao}
									resetOptionLabel="SELECIONE ANTES OU DEPOIS"
									options={CampaignExecutionDelayDirectionOptions}
									handleChange={(value) =>
										updateCampaign({ execucaoAgendadaDirecao: value as TUseCampaignState["state"]["campaign"]["execucaoAgendadaDirecao"] })
									}
									onReset={() => updateCampaign({ execucaoAgendadaDirecao: "DEPOIS" })}
								/>
							</div>
						) : null}
						<div className={supportsAntes ? "w-full lg:w-1/3" : "w-full lg:w-1/2"}>
							<SelectInput
								label="UNIDADE DE TEMPO"
								value={campaign.execucaoAgendadaMedida}
								resetOptionLabel="SELECIONE A MEDIDA"
								options={TimeDurationUnitsOptions}
								handleChange={(value) =>
									updateCampaign({ execucaoAgendadaMedida: value as TUseCampaignState["state"]["campaign"]["execucaoAgendadaMedida"] })
								}
								onReset={() => updateCampaign({ execucaoAgendadaMedida: "DIAS" })}
							/>
						</div>
						<div className={supportsAntes ? "w-full lg:w-1/3" : "w-full lg:w-1/2"}>
							<NumberInput
								label="QUANTIDADE (INTERVALO)"
								value={campaign.execucaoAgendadaValor}
								placeholder="Ex.: 3 (com DIAS = três dias de intervalo)"
								handleChange={(value) => updateCampaign({ execucaoAgendadaValor: value })}
							/>
						</div>
					</div>
				</div>
			) : null}
			<div className="w-full flex flex-col gap-3">
				<p className="text-center text-sm tracking-tight leading-snug text-muted-foreground">
					{isRecorrente
						? "Campanhas recorrentes são processadas em lotes. Escolha a janela de uma hora do dia em que os envios desta campanha podem ser incluídos na fila."
						: isUsoUnico
							? "Campanhas de uso único também seguem processamento em lotes. Escolha a janela de uma hora em que o disparo pode entrar na fila."
							: "Além do intervalo acima, escolha em qual janela de uma hora os disparos desta automação podem ser processados."}
				</p>
				<p className="text-center text-xs leading-snug text-muted-foreground">
					O horário não é um minuto fixo por cliente: é uma janela de processamento; dentro dela o sistema distribui os envios conforme a fila e os limites
					da conta.
				</p>
				<SelectInput
					label="JANELA DE ENVIO"
					value={campaign.execucaoAgendadaBloco}
					resetOptionLabel="SELECIONE A JANELA DE ENVIO"
					options={InteractionsCronJobTimeBlocksOptions}
					handleChange={(value) => updateCampaign({ execucaoAgendadaBloco: value as TUseCampaignState["state"]["campaign"]["execucaoAgendadaBloco"] })}
					onReset={() => updateCampaign({ execucaoAgendadaBloco: "06:00" })}
				/>
			</div>
		</ResponsiveMenuSection>
	);
}

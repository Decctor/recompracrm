import { useFiscalSettings } from "@/lib/queries/fiscal";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TFiscalOperationConsumerPresenceEnum, TFiscalOperationFinalityEnum } from "@/schemas/enums";
import type { TUseFiscalOperationProfileState } from "@/state-hooks/use-fiscal-operation-profile-state";
import { Flag } from "lucide-react";

const FINALITY_OPTIONS: { id: TFiscalOperationFinalityEnum; value: TFiscalOperationFinalityEnum; label: string }[] = [
	{ id: "NORMAL", value: "NORMAL", label: "NORMAL" },
	{ id: "COMPLEMENTAR", value: "COMPLEMENTAR", label: "COMPLEMENTAR" },
	{ id: "AJUSTE", value: "AJUSTE", label: "AJUSTE" },
	{ id: "DEVOLUCAO", value: "DEVOLUCAO", label: "DEVOLUÇÃO" },
];

const CONSUMER_PRESENCE_OPTIONS: {
	id: TFiscalOperationConsumerPresenceEnum;
	value: TFiscalOperationConsumerPresenceEnum;
	label: string;
}[] = [
	{ id: "NAO_SE_APLICA", value: "NAO_SE_APLICA", label: "NÃO SE APLICA" },
	{ id: "OPERACAO_PRESENCIAL", value: "OPERACAO_PRESENCIAL", label: "PRESENCIAL" },
	{ id: "INTERNET", value: "INTERNET", label: "INTERNET" },
	{ id: "TELEATENDIMENTO", value: "TELEATENDIMENTO", label: "TELEATENDIMENTO" },
	{ id: "ENTREGA_DOMICILIO", value: "ENTREGA_DOMICILIO", label: "ENTREGA À DOMICÍLIO" },
];

type FiscalOperationProfileOperationBlockProps = {
	fiscalOperationProfile: TUseFiscalOperationProfileState["state"]["fiscalOperationProfile"];
	updateFiscalOperationProfile: TUseFiscalOperationProfileState["updateFiscalOperationProfile"];
};
export default function FiscalOperationProfileOperationBlock({
	fiscalOperationProfile,
	updateFiscalOperationProfile,
}: FiscalOperationProfileOperationBlockProps) {
	const settings = useFiscalSettings();
	const resaleEnabled = !!settings.data?.fiscalConfiguracao?.operacoesRevenda?.habilitada;
	return (
		<ResponsiveMenuSection title="PARÂMETROS DA OPERAÇÃO" icon={<Flag className="h-4 min-h-4 w-4 min-w-4" />}>
			<p className="text-sm font-medium text-muted-foreground">
				Parâmetros aplicados às emissões feitas com este perfil. Sigam a natureza tributária da operação.
			</p>
			<div className="w-full flex items-start gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<SelectInput
						label="FINALIDADE"
						value={fiscalOperationProfile.finalidade}
						options={FINALITY_OPTIONS}
						resetOptionLabel="SELECIONE UMA FINALIDADE"
						handleChange={(value) => updateFiscalOperationProfile({ finalidade: value as TFiscalOperationFinalityEnum })}
						onReset={() => updateFiscalOperationProfile({ finalidade: "NORMAL" })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<SelectInput
						label="PRESENÇA DO CONSUMIDOR"
						value={fiscalOperationProfile.presencaConsumidor}
						options={CONSUMER_PRESENCE_OPTIONS}
						resetOptionLabel="SELECIONE A PRESENÇA"
						handleChange={(value) => updateFiscalOperationProfile({ presencaConsumidor: value as TFiscalOperationConsumerPresenceEnum })}
						onReset={() => updateFiscalOperationProfile({ presencaConsumidor: "OPERACAO_PRESENCIAL" })}
					/>
				</div>
			</div>

			<div className="w-full flex items-start gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<TextInput
						label="CFOP PADRÃO"
						value={fiscalOperationProfile.cfopPadrao}
						placeholder="Ex.: 5102"
						handleChange={(value) => updateFiscalOperationProfile({ cfopPadrao: value })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<TextInput
						label="NATUREZA DA OPERAÇÃO"
						value={fiscalOperationProfile.naturezaOperacao}
						placeholder="Ex.: VENDA DE MERCADORIA"
						handleChange={(value) => updateFiscalOperationProfile({ naturezaOperacao: value })}
					/>
				</div>
			</div>

			{resaleEnabled ? (
				<SelectInput
					label="DESTINAÇÃO PADRÃO DA COMPRA"
					value={fiscalOperationProfile.consumidorFinal ? "CONSUMO_FINAL" : "REVENDA_INDUSTRIALIZACAO"}
					options={[
						{ id: "REVENDA_INDUSTRIALIZACAO", value: "REVENDA_INDUSTRIALIZACAO", label: "Revenda ou industrialização" },
						{ id: "CONSUMO_FINAL", value: "CONSUMO_FINAL", label: "Uso ou consumo final" },
					]}
					resetOptionLabel="CONSUMO FINAL"
					handleChange={(value) => updateFiscalOperationProfile({ consumidorFinal: value === "CONSUMO_FINAL" })}
					onReset={() => updateFiscalOperationProfile({ consumidorFinal: true })}
				/>
			) : (
				<div className="w-full flex items-center justify-center">
					<CheckboxInput
						checked={fiscalOperationProfile.consumidorFinal}
						labelTrue="OPERAÇÃO DESTINADA AO CONSUMIDOR FINAL"
						labelFalse="OPERAÇÃO NÃO DESTINADA AO CONSUMIDOR FINAL"
						handleChange={(value) => updateFiscalOperationProfile({ consumidorFinal: value })}
						justify="justify-center"
					/>
				</div>
			)}
		</ResponsiveMenuSection>
	);
}

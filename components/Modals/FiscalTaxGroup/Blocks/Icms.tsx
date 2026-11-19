import { useFiscalSettings } from "@/lib/queries/fiscal";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TFiscalIcmsCsosnEnum } from "@/schemas/enums";
import type { TUseFiscalTaxGroupState } from "@/state-hooks/use-fiscal-tax-group-state";
import { Percent } from "lucide-react";

export const CSOSN_OPTIONS: { id: TFiscalIcmsCsosnEnum; value: TFiscalIcmsCsosnEnum; label: string }[] = [
	{ id: "101", value: "101", label: "101 - Tributada com permissão de crédito" },
	{ id: "102", value: "102", label: "102 - Tributada sem permissão de crédito" },
	{ id: "103", value: "103", label: "103 - Isenção do ICMS para faixa de receita" },
	{ id: "201", value: "201", label: "201 - Com crédito e com ICMS-ST" },
	{ id: "202", value: "202", label: "202 - Sem crédito e com ICMS-ST" },
	{ id: "203", value: "203", label: "203 - Isenção e com ICMS-ST" },
	{ id: "300", value: "300", label: "300 - Imune" },
	{ id: "400", value: "400", label: "400 - Não tributada pelo Simples Nacional" },
	{ id: "500", value: "500", label: "500 - ICMS cobrado anteriormente por ST" },
	{ id: "900", value: "900", label: "900 - Outros" },
];

type FiscalTaxGroupIcmsBlockProps = {
	fiscalTaxGroup: TUseFiscalTaxGroupState["state"]["fiscalTaxGroup"];
	updateFiscalTaxGroup: TUseFiscalTaxGroupState["updateFiscalTaxGroup"];
};
export default function FiscalTaxGroupIcmsBlock({ fiscalTaxGroup, updateFiscalTaxGroup }: FiscalTaxGroupIcmsBlockProps) {
	const settings = useFiscalSettings();
	const creditEnabled = !!settings.data?.fiscalConfiguracao?.operacoesRevenda?.habilitada;
	const csosnPermiteCredito = fiscalTaxGroup.csosn === "101" || fiscalTaxGroup.csosn === "201";
	return (
		<ResponsiveMenuSection title="ICMS (SIMPLES NACIONAL)" icon={<Percent className="h-4 min-h-4 w-4 min-w-4" />}>
			<SelectInput
				label="CSOSN"
				value={fiscalTaxGroup.csosn}
				options={CSOSN_OPTIONS}
				resetOptionLabel="SELECIONE O CSOSN"
				handleChange={(value) => updateFiscalTaxGroup({ csosn: value as TFiscalIcmsCsosnEnum })}
				onReset={() => updateFiscalTaxGroup({ csosn: "102" })}
			/>

			<div className="w-full flex items-start gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<NumberInput
						label="ALÍQUOTA DE ICMS (%)"
						value={fiscalTaxGroup.aliquotaIcms}
						placeholder="Ex.: 0"
						handleChange={(value) => updateFiscalTaxGroup({ aliquotaIcms: value })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<NumberInput
						label="REDUÇÃO DA BASE (%)"
						value={fiscalTaxGroup.percentualReducaoBc}
						placeholder="Ex.: 0"
						handleChange={(value) => updateFiscalTaxGroup({ percentualReducaoBc: value })}
					/>
				</div>
			</div>

			{csosnPermiteCredito && !creditEnabled ? (
				<NumberInput
					label="% CRÉDITO DO SIMPLES NACIONAL"
					value={fiscalTaxGroup.percentualCreditoSn}
					placeholder="Ex.: 2.5"
					handleChange={(value) => updateFiscalTaxGroup({ percentualCreditoSn: value })}
				/>
			) : null}

			{creditEnabled ? (
				<>
					<p className="text-xs text-muted-foreground">
						No fluxo por operação, o percentual vem do histórico por competência. O percentual fixo do grupo e das regras não será utilizado.
					</p>
					<SelectInput
						label="CSOSN PARA OPERAÇÃO COM CRÉDITO"
						value={fiscalTaxGroup.csosnComCredito ?? null}
						options={CSOSN_OPTIONS.filter((option) => ["101", "201"].includes(option.id))}
						resetOptionLabel="NÃO CONFIGURADO"
						handleChange={(value) => updateFiscalTaxGroup({ csosnComCredito: value as TFiscalIcmsCsosnEnum })}
						onReset={() => updateFiscalTaxGroup({ csosnComCredito: null })}
					/>
					<SelectInput
						label="CSOSN PARA OPERAÇÃO SEM CRÉDITO"
						value={fiscalTaxGroup.csosnSemCredito ?? null}
						options={CSOSN_OPTIONS.filter((option) => ["102", "202"].includes(option.id))}
						resetOptionLabel="NÃO CONFIGURADO"
						handleChange={(value) => updateFiscalTaxGroup({ csosnSemCredito: value as TFiscalIcmsCsosnEnum })}
						onReset={() => updateFiscalTaxGroup({ csosnSemCredito: null })}
					/>
				</>
			) : null}

			<NumberInput
				label="ALÍQUOTA DE FCP (%)"
				value={fiscalTaxGroup.aliquotaFcp}
				placeholder="Ex.: 0 — Fundo de Combate à Pobreza"
				handleChange={(value) => updateFiscalTaxGroup({ aliquotaFcp: value })}
			/>

			<div className="w-full flex items-center justify-center mt-1">
				<CheckboxInput
					checked={fiscalTaxGroup.temSubstituicaoTributaria}
					labelTrue="COM SUBSTITUIÇÃO TRIBUTÁRIA (ICMS-ST)"
					labelFalse="SEM SUBSTITUIÇÃO TRIBUTÁRIA"
					handleChange={(value) => updateFiscalTaxGroup({ temSubstituicaoTributaria: value })}
					justify="justify-center"
				/>
			</div>

			{fiscalTaxGroup.temSubstituicaoTributaria ? (
				<div className="w-full flex flex-col gap-2">
					<p className="text-xs font-medium text-muted-foreground">Configuração manual de ICMS-ST. Preencha MVA e alíquota interna de destino.</p>
					<div className="w-full flex items-start gap-2 flex-col lg:flex-row">
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="MVA (%)"
								value={fiscalTaxGroup.mvaSt}
								placeholder="Ex.: 40"
								handleChange={(value) => updateFiscalTaxGroup({ mvaSt: value })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="ALÍQUOTA INTERNA DO DESTINO (%)"
								value={fiscalTaxGroup.aliquotaInternaDestino}
								placeholder="Ex.: 18"
								handleChange={(value) => updateFiscalTaxGroup({ aliquotaInternaDestino: value })}
							/>
						</div>
					</div>
					<div className="w-full flex items-start gap-2 flex-col lg:flex-row">
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="ALÍQUOTA DE ICMS-ST (%)"
								value={fiscalTaxGroup.aliquotaIcmsSt}
								placeholder="Opcional — usa a interna do destino se vazio"
								handleChange={(value) => updateFiscalTaxGroup({ aliquotaIcmsSt: value })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="REDUÇÃO DA BASE DE ST (%)"
								value={fiscalTaxGroup.percentualReducaoBcSt}
								placeholder="Ex.: 0"
								handleChange={(value) => updateFiscalTaxGroup({ percentualReducaoBcSt: value })}
							/>
						</div>
					</div>
					<NumberInput
						label="ALÍQUOTA DE FCP-ST (%)"
						value={fiscalTaxGroup.aliquotaFcpSt}
						placeholder="Ex.: 0 — FCP retido por ST"
						handleChange={(value) => updateFiscalTaxGroup({ aliquotaFcpSt: value })}
					/>
				</div>
			) : null}
		</ResponsiveMenuSection>
	);
}

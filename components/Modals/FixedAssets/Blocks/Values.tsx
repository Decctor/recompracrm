"use client";

import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import type { TUseInternalFixedAssetState } from "@/state-hooks/use-internal-fixed-asset-state";
import { Calculator } from "lucide-react";

type FixedAssetValuesBlockProps = {
	asset: TUseInternalFixedAssetState["state"]["asset"];
	updateAsset: TUseInternalFixedAssetState["updateAsset"];
	/** Bem nascido de uma compra: aquisição, quantidade e CIAP vêm dela e não mudam aqui. */
	acquisitionEditable?: boolean;
	editable?: boolean;
};

export default function FixedAssetValuesBlock({ asset, updateAsset, acquisitionEditable = true, editable = true }: FixedAssetValuesBlockProps) {
	return (
		<ResponsiveMenuSection title="VALORES E DEPRECIAÇÃO" icon={<Calculator className="h-4 w-4" />}>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<NumberInput
					label="QUANTIDADE"
					placeholder="1"
					value={asset.quantidade}
					editable={editable && acquisitionEditable}
					handleChange={(value) => updateAsset({ quantidade: Math.max(1, Math.round(value)) })}
				/>
				<NumberInput
					label="VALOR DE AQUISIÇÃO (TOTAL DO REGISTRO)"
					placeholder="0,00"
					value={asset.valorAquisicao}
					editable={editable && acquisitionEditable}
					handleChange={(value) => updateAsset({ valorAquisicao: value })}
				/>
				<DateInput
					label="INÍCIO DE USO"
					value={formatDateForInputValue(asset.dataInicioUso)}
					editable={editable}
					handleChange={(value) => updateAsset({ dataInicioUso: formatDateOnInputChange(value, "date") ?? asset.dataInicioUso })}
					required
				/>
				<NumberInput
					label="VIDA ÚTIL (MESES)"
					placeholder="120"
					value={asset.vidaUtilMeses}
					editable={editable}
					handleChange={(value) => updateAsset({ vidaUtilMeses: Math.max(1, Math.round(value)) })}
				/>
				<NumberInput
					label="VALOR RESIDUAL"
					placeholder="0,00"
					value={asset.valorResidual}
					editable={editable}
					handleChange={(value) => updateAsset({ valorResidual: value })}
				/>
				<NumberInput
					label="DEPRECIAÇÃO JÁ ACUMULADA"
					placeholder="0,00"
					value={asset.depreciacaoAcumuladaInicial}
					editable={editable && acquisitionEditable}
					handleChange={(value) => updateAsset({ depreciacaoAcumuladaInicial: value })}
				/>
				<NumberInput
					label="CRÉDITO DE ICMS A APROPRIAR (CIAP)"
					placeholder="Vazio = sem CIAP"
					value={asset.creditoIcmsCiap ?? 0}
					editable={editable && acquisitionEditable}
					handleChange={(value) => updateAsset({ creditoIcmsCiap: value > 0 ? value : null })}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				Depreciação linear: (aquisição − residual) ÷ vida útil, por mês, a partir do mês de início de uso. O CIAP é apropriado em 48 parcelas mensais.
				{acquisitionEditable ? " Bens já em uso antes do sistema informam o que já estava depreciado." : " Aquisição, quantidade e CIAP vêm da compra de origem."}
			</p>
		</ResponsiveMenuSection>
	);
}

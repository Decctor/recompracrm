"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import {
	DEFAULT_SCALE_BARCODE_CONFIG,
	normalizeScalePlu,
	parseScaleBarcodeMask,
	readScaleBarcode,
	SCALE_BARCODE_MASK_PRESETS,
} from "@/lib/pos/scale-barcode";
import type { TOrganizationScaleBarcodeConfig } from "@/schemas/organizations";
import { useState } from "react";

const VALUE_TYPE_OPTIONS = [
	{ id: "PRECO", value: "PRECO", label: "PREÇO (total a pagar)" },
	{ id: "PESO", value: "PESO", label: "PESO (quantidade pesada)" },
];

const DECIMAL_OPTIONS = [0, 1, 2, 3].map((places) => ({ id: places, value: String(places), label: `${places} ${places === 1 ? "casa" : "casas"}` }));

const PRESET_OPTIONS = SCALE_BARCODE_MASK_PRESETS.map((preset) => ({
	id: preset.mascara,
	value: preset.mascara,
	label: `${preset.mascara} · ${preset.label}`,
}));

type SettingsScaleBarcodeProps = {
	balanca: TOrganizationScaleBarcodeConfig;
	updateBalanca: (partial: Partial<TOrganizationScaleBarcodeConfig>) => void;
	editable: boolean;
};

/**
 * Layout da etiqueta da balança. O modelo nem sempre é conhecido, então a máscara é descrita aqui
 * e conferida na hora contra uma etiqueta real — é o teste que diz se a configuração está certa.
 */
export default function SettingsScaleBarcode({ balanca, updateBalanca, editable }: SettingsScaleBarcodeProps) {
	const [sample, setSample] = useState("");
	const maskResult = parseScaleBarcodeMask(balanca.mascara);
	const reading = sample.trim() && maskResult.ok ? readScaleBarcode(sample, { ...balanca, habilitado: true }) : null;

	return (
		<div className="flex flex-col gap-3 py-3">
			<p className="text-muted-foreground text-xs">
				Na máscara, cada caractere é uma posição do código: dígito é fixo, <strong>P</strong> é o código do produto na balança (PLU), <strong>V</strong> é
				o valor e <strong>D</strong> é o dígito verificador. No cadastro do produto, informe o PLU no campo de código de barras.
			</p>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<SelectInput
					label="LAYOUTS COMUNS"
					value={SCALE_BARCODE_MASK_PRESETS.some((preset) => preset.mascara === balanca.mascara) ? balanca.mascara : null}
					options={PRESET_OPTIONS}
					resetOptionLabel="Personalizado"
					editable={editable}
					handleChange={(mascara) => updateBalanca({ mascara })}
					onReset={() => {}}
				/>
				<div className="flex flex-col gap-1">
					<TextInput
						label="MÁSCARA"
						value={balanca.mascara}
						placeholder={DEFAULT_SCALE_BARCODE_CONFIG.mascara}
						editable={editable}
						maxLength={13}
						className="font-mono uppercase"
						handleChange={(value) => updateBalanca({ mascara: value.toUpperCase() })}
					/>
					{!maskResult.ok ? <span className="text-destructive text-xs">{maskResult.error}</span> : null}
				</div>
				<SelectInput
					label="O VALOR DA ETIQUETA É"
					value={balanca.tipoValor}
					options={VALUE_TYPE_OPTIONS}
					resetOptionLabel="PREÇO (total a pagar)"
					editable={editable}
					handleChange={(value) => updateBalanca({ tipoValor: value === "PESO" ? "PESO" : "PRECO" })}
					onReset={() => updateBalanca({ tipoValor: "PRECO" })}
				/>
				<SelectInput
					label="CASAS DECIMAIS DO VALOR"
					value={String(balanca.casasDecimais)}
					options={DECIMAL_OPTIONS}
					resetOptionLabel={balanca.tipoValor === "PESO" ? "3 casas" : "2 casas"}
					editable={editable}
					handleChange={(value) => updateBalanca({ casasDecimais: Number(value) })}
					onReset={() => updateBalanca({ casasDecimais: balanca.tipoValor === "PESO" ? 3 : 2 })}
				/>
			</div>

			<div className="bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
				<TextInput
					label="TESTAR COM UMA ETIQUETA"
					value={sample}
					placeholder="Bipe ou digite o código de uma etiqueta da balança"
					className="font-mono"
					handleChange={setSample}
				/>
				{sample.trim() ? (
					reading ? (
						<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
							<span>
								PLU: <strong className="font-mono">{normalizeScalePlu(reading.plu) ?? reading.plu}</strong>
							</span>
							<span>
								{reading.tipoValor === "PRECO" ? "Total: " : "Peso: "}
								<strong>{reading.tipoValor === "PRECO" ? formatToMoney(reading.valor) : `${formatDecimalPlaces(reading.valor, 0, 3)} kg`}</strong>
							</span>
						</div>
					) : (
						<span className="text-destructive text-xs">
							{maskResult.ok ? "Esse código não corresponde à máscara (prefixo, tamanho ou dígito verificador)." : "Corrija a máscara para testar."}
						</span>
					)
				) : null}
			</div>
		</div>
	);
}

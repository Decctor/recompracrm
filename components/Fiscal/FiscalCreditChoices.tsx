"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import type { TFiscalSaleChoices } from "@/schemas/fiscal";

export function FiscalCreditChoices({
	value,
	onChange,
	disabled = false,
}: {
	value: TFiscalSaleChoices;
	onChange: (value: TFiscalSaleChoices) => void;
	disabled?: boolean;
}) {
	return (
		<FieldGroup className="gap-3">
			<SelectInput
				label="DESTINAÇÃO DA COMPRA"
				value={value.fiscalDestinacao ?? null}
				options={[
					{ id: "REVENDA_INDUSTRIALIZACAO", value: "REVENDA_INDUSTRIALIZACAO", label: "Revenda ou industrialização" },
					{ id: "CONSUMO_FINAL", value: "CONSUMO_FINAL", label: "Uso ou consumo final" },
				]}
				resetOptionLabel="CONFIRME A DESTINAÇÃO"
				editable={!disabled}
				handleChange={(destination) =>
					onChange({
						fiscalDestinacao: destination as TFiscalSaleChoices["fiscalDestinacao"],
						fiscalCreditoIcms: destination === "CONSUMO_FINAL" ? "SEM_CREDITO" : "NAO_CONFIRMADO",
					})
				}
				onReset={() => onChange({ fiscalDestinacao: null, fiscalCreditoIcms: "NAO_CONFIRMADO" })}
			/>
			{value.fiscalDestinacao === "REVENDA_INDUSTRIALIZACAO" ? (
				<>
					<SelectInput
						label="CRÉDITO DE ICMS DO SIMPLES NACIONAL"
						value={value.fiscalCreditoIcms ?? "NAO_CONFIRMADO"}
						options={[
							{ id: "NAO_CONFIRMADO", value: "NAO_CONFIRMADO", label: "Não confirmado" },
							{ id: "SEM_CREDITO", value: "SEM_CREDITO", label: "Emitir sem crédito" },
							{ id: "COM_CREDITO", value: "COM_CREDITO", label: "Informar crédito nos itens elegíveis" },
						]}
						resetOptionLabel="NÃO CONFIRMADO"
						editable={!disabled}
						handleChange={(decision) => onChange({ ...value, fiscalCreditoIcms: decision as TFiscalSaleChoices["fiscalCreditoIcms"] })}
						onReset={() => onChange({ ...value, fiscalCreditoIcms: "NAO_CONFIRMADO" })}
					/>
					<FieldDescription>
						Informe crédito somente quando o regime do destinatário e a operação tiverem sido confirmados com a contabilidade. CNPJ e inscrição estadual não
						comprovam esse direito.
					</FieldDescription>
				</>
			) : null}
		</FieldGroup>
	);
}

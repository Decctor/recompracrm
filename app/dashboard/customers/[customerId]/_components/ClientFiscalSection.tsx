"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import type { TFiscalClientTaxIndicatorEnum } from "@/schemas/enums";
import type { TUseClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { FileText } from "lucide-react";

const INDICADOR_INSCRICAO_ESTADUAL_OPTIONS: { id: TFiscalClientTaxIndicatorEnum; value: TFiscalClientTaxIndicatorEnum; label: string }[] = [
	{ id: "CONTRIBUINTE_ICMS", value: "CONTRIBUINTE_ICMS", label: "CONTRIBUINTE DE ICMS" },
	{ id: "CONTRIBUINTE_ISENTO", value: "CONTRIBUINTE_ISENTO", label: "CONTRIBUINTE ISENTO" },
	{ id: "NAO_CONTRIBUINTE", value: "NAO_CONTRIBUINTE", label: "NÃO CONTRIBUINTE" },
];

type ClientFiscalSectionProps = {
	editor: TUseClientSectionEditor;
};

/**
 * Dados fiscais do cliente. Até aqui esses três campos existiam no banco e no importador, mas não
 * tinham onde ser corrigidos na interface — o cadastro só os expunha na criação via integração.
 */
export default function ClientFiscalSection({ editor }: ClientFiscalSectionProps) {
	const { state, updateClient } = editor;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<FileText />
				</Section.Icon>
				<Section.Title>Dados fiscais</Section.Title>
			</Section.Header>
			<Section.Body>
				<SelectInput
					label="INDICADOR DE INSCRIÇÃO ESTADUAL"
					value={state.client.indicadorInscricaoEstadual}
					options={INDICADOR_INSCRICAO_ESTADUAL_OPTIONS}
					handleChange={(value) => updateClient({ indicadorInscricaoEstadual: value as TFiscalClientTaxIndicatorEnum })}
					onReset={() => updateClient({ indicadorInscricaoEstadual: "NAO_CONTRIBUINTE" })}
					resetOptionLabel="NÃO CONTRIBUINTE"
				/>
				<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
					<TextInput
						label="INSCRIÇÃO ESTADUAL"
						placeholder="Isento"
						value={state.client.inscricaoEstadual ?? ""}
						handleChange={(value) => updateClient({ inscricaoEstadual: value || null })}
					/>
					<TextInput
						label="SUFRAMA"
						placeholder="Não informado"
						value={state.client.suframa ?? ""}
						handleChange={(value) => updateClient({ suframa: value || null })}
					/>
				</div>
				{state.client.cpfCnpj ? null : <p className="text-muted-foreground text-xs">Sem CPF/CNPJ a nota fiscal sai como consumidor não identificado.</p>}

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}

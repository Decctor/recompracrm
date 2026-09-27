"use client";

import CheckboxInput from "@/components/Inputs/CheckboxInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { CUSTOM_FIELD_TYPE_LABELS, CustomFieldTypeEnum, type TCustomFieldTypeEnum } from "@/schemas/enums";
import { CUSTOM_FIELD_CHOICE_TYPES, isCustomFieldChoiceType, type TUseInternalCustomFieldState } from "@/state-hooks/use-internal-custom-field-state";
import { LayoutGrid, Lock } from "lucide-react";

const TYPE_DESCRIPTIONS: Record<TCustomFieldTypeEnum, string> = {
	ESCOLHA_UNICA: "O cliente escolhe uma opção. Serve para pesquisas e filtros de público.",
	ESCOLHA_MULTIPLA: "O cliente pode marcar várias opções. Cada resposta acumula.",
	TEXTO: "Texto livre. Não entra em filtros de público.",
	NUMERO: "Um número. Não entra em filtros de público.",
	DATA: "Uma data. Não entra em filtros de público.",
};

type CustomFieldGeneralBlockProps = {
	customField: TUseInternalCustomFieldState["state"]["customField"];
	updateCustomField: TUseInternalCustomFieldState["updateCustomField"];
	/** Só tipos de escolha (pesquisas e filtros): o seletor fica restrito a eles. */
	choiceTypesOnly?: boolean;
	/** Campo nativo ou com respostas gravadas: o tipo não muda mais. */
	typeLocked?: boolean;
	typeLockedReason?: string;
};

export default function CustomFieldGeneralBlock({
	customField,
	updateCustomField,
	choiceTypesOnly = false,
	typeLocked = false,
	typeLockedReason,
}: CustomFieldGeneralBlockProps) {
	const typeOptions = (choiceTypesOnly ? [...CUSTOM_FIELD_CHOICE_TYPES] : CustomFieldTypeEnum.options).map((tipo, index) => ({
		id: index + 1,
		value: tipo,
		label: CUSTOM_FIELD_TYPE_LABELS[tipo].toUpperCase(),
	}));

	function handleTypeChange(tipo: TCustomFieldTypeEnum) {
		updateCustomField({
			tipo,
			// Entrar num tipo de escolha sem opções semeia duas linhas; sair descarta as opções.
			opcoes: isCustomFieldChoiceType(tipo)
				? customField.opcoes && customField.opcoes.length > 0
					? customField.opcoes
					: [
							{ valor: "", titulo: "", legenda: null, icone: null },
							{ valor: "", titulo: "", legenda: null, icone: null },
						]
				: null,
		});
	}

	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 w-4" />}>
			<div className="flex w-full items-center justify-center">
				<CheckboxInput
					checked={customField.ativo}
					labelTrue="ATIVO"
					labelFalse="INATIVO"
					description={customField.ativo ? "Aceita novas respostas e aparece nos filtros." : "Mantém o histórico, mas não aceita respostas novas."}
					handleChange={(value) => updateCustomField({ ativo: value })}
				/>
			</div>
			<TextInput
				label="TÍTULO"
				required
				value={customField.titulo}
				placeholder="Ex.: Sabor preferido"
				handleChange={(value) => updateCustomField({ titulo: value })}
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				value={customField.descricao ?? ""}
				placeholder="Opcional — o que este campo registra e para que serve"
				handleChange={(value) => updateCustomField({ descricao: value || null })}
			/>
			<div className="flex w-full flex-col gap-1">
				<SelectInput
					label="TIPO DE RESPOSTA"
					value={customField.tipo}
					options={typeOptions}
					resetOptionLabel="SELECIONE O TIPO"
					editable={!typeLocked}
					handleChange={(value) => handleTypeChange(value as TCustomFieldTypeEnum)}
					onReset={() => handleTypeChange("ESCOLHA_UNICA")}
				/>
				<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
					{typeLocked ? <Lock className="h-3 w-3" /> : null}
					{typeLocked && typeLockedReason ? typeLockedReason : TYPE_DESCRIPTIONS[customField.tipo]}
				</p>
			</div>
		</ResponsiveMenuSection>
	);
}

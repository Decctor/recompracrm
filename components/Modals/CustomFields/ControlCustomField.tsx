"use client";

import type { TUpdateCustomFieldInput, TUpdateCustomFieldOutput } from "@/app/api/custom-fields/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateCustomField } from "@/lib/mutations/custom-fields";
import { useCustomFieldById } from "@/lib/queries/custom-fields";
import { isCustomFieldChoiceType, prepareCustomFieldForSubmit, useInternalCustomFieldState } from "@/state-hooks/use-internal-custom-field-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import CustomFieldGeneralBlock from "./Blocks/General";
import CustomFieldOptionsBlock from "./Blocks/Options";

type ControlCustomFieldProps = {
	customFieldId: string;
	closeModal: () => void;
	/** Valores de opção em uso por templates de pesquisa (não removíveis). Opcional; o servidor recusa de qualquer forma. */
	lockedOptionValues?: string[];
	callbacks?: {
		onMutate?: (variables: TUpdateCustomFieldInput) => void;
		onSuccess?: (response: TUpdateCustomFieldOutput) => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlCustomField({ customFieldId, closeModal, lockedOptionValues, callbacks }: ControlCustomFieldProps) {
	const queryClient = useQueryClient();
	const { data: customField, isLoading, isError, error } = useCustomFieldById({ fieldId: customFieldId });
	const { state, updateCustomField: updateState, addOption, updateOption, removeOption, moveOption, redefineState } = useInternalCustomFieldState();

	useEffect(() => {
		if (!customField) return;
		redefineState({
			customField: {
				entidade: customField.entidade,
				chaveNativa: customField.chaveNativa,
				titulo: customField.titulo,
				descricao: customField.descricao,
				tipo: customField.tipo,
				opcoes: customField.opcoes ?? (isCustomFieldChoiceType(customField.tipo) ? [] : null),
				ativo: customField.ativo,
			},
		});
	}, [customField, redefineState]);

	const lockedValues = useMemo(() => new Set(lockedOptionValues ?? []), [lockedOptionValues]);
	const isNative = !!customField?.chaveNativa;

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-custom-field", customFieldId],
		mutationFn: updateCustomField,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (response) => {
			await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
			await queryClient.invalidateQueries({ queryKey: ["custom-field-by-id", customFieldId] });
			callbacks?.onSuccess?.(response);
			toast.success(response.message);
			closeModal();
		},
		onError: (mutationError) => {
			callbacks?.onError?.(mutationError);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		try {
			const prepared = prepareCustomFieldForSubmit(state.customField);
			mutate({
				customFieldId,
				customField: { titulo: prepared.titulo, descricao: prepared.descricao, tipo: prepared.tipo, opcoes: prepared.opcoes, ativo: prepared.ativo },
			});
		} catch (submitError) {
			toast.error(getErrorMessage(submitError));
		}
	}

	return (
		<ResponsiveMenu
			menuTitle="EDITAR CAMPO PERSONALIZADO"
			menuDescription={isNative ? "Campo pronto da plataforma: o tipo é fixo; título, descrição e opções são seus." : "Ajuste o campo. O tipo só muda enquanto não houver respostas gravadas."}
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CustomFieldGeneralBlock
				customField={state.customField}
				updateCustomField={updateState}
				typeLocked={isNative}
				typeLockedReason={isNative ? "O tipo de um campo pronto é definido pela plataforma." : undefined}
			/>
			{isCustomFieldChoiceType(state.customField.tipo) ? (
				<CustomFieldOptionsBlock
					options={state.customField.opcoes ?? []}
					addOption={addOption}
					updateOption={updateOption}
					removeOption={removeOption}
					moveOption={moveOption}
					lockedValues={lockedValues}
				/>
			) : null}
		</ResponsiveMenu>
	);
}

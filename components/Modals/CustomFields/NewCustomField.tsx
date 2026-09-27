"use client";

import type { TCreateCustomFieldInput, TCreateCustomFieldOutput } from "@/app/api/custom-fields/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCustomField } from "@/lib/mutations/custom-fields";
import {
	isCustomFieldChoiceType,
	prepareCustomFieldForSubmit,
	type TUseInternalCustomFieldStateProps,
	useInternalCustomFieldState,
} from "@/state-hooks/use-internal-custom-field-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import CustomFieldGeneralBlock from "./Blocks/General";
import CustomFieldOptionsBlock from "./Blocks/Options";

type NewCustomFieldProps = {
	closeModal: () => void;
	/** Estado inicial (o construtor de campanhas abre com um título sugerido, por exemplo). */
	initialState?: TUseInternalCustomFieldStateProps["initialState"];
	/** Pesquisas e filtros só aceitam campos de escolha: restringe o tipo a eles. */
	choiceTypesOnly?: boolean;
	callbacks?: {
		onMutate?: (variables: TCreateCustomFieldInput) => void;
		/** Recebe a resposta para que quem abriu o modal possa já selecionar o campo novo. */
		onSuccess?: (response: TCreateCustomFieldOutput) => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Criação de campo personalizado próprio da organização. Campos nativos (gênero, data de
 * nascimento…) não passam aqui: são ativados a partir do catálogo, na tela de campos.
 */
export default function NewCustomField({ closeModal, initialState, choiceTypesOnly = false, callbacks }: NewCustomFieldProps) {
	const queryClient = useQueryClient();
	const { state, updateCustomField, addOption, updateOption, removeOption, moveOption } = useInternalCustomFieldState({ initialState });

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-custom-field"],
		mutationFn: createCustomField,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (response) => {
			await queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
			callbacks?.onSuccess?.(response);
			toast.success(response.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		try {
			const customField = prepareCustomFieldForSubmit(state.customField);
			mutate({ customField: { ...customField, chaveNativa: null } });
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}

	return (
		<ResponsiveMenu
			menuTitle="NOVO CAMPO PERSONALIZADO"
			menuDescription="Um dado a mais sobre o cliente, coletado no cadastro ou numa pesquisa e usado para segmentar públicos."
			menuActionButtonText="CRIAR CAMPO"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CustomFieldGeneralBlock customField={state.customField} updateCustomField={updateCustomField} choiceTypesOnly={choiceTypesOnly} />
			{isCustomFieldChoiceType(state.customField.tipo) ? (
				<CustomFieldOptionsBlock
					options={state.customField.opcoes ?? []}
					addOption={addOption}
					updateOption={updateOption}
					removeOption={removeOption}
					moveOption={moveOption}
				/>
			) : null}
		</ResponsiveMenu>
	);
}

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateProduction } from "@/lib/mutations/productions";
import { useProductionById } from "@/lib/queries/productions";
import { useInternalProductionState } from "@/state-hooks/use-internal-production-state";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import ProductionGeneralBlock from "./Blocks/ProductionGeneral";
import { ProductionInputsBlock, ProductionOutputsBlock } from "./Blocks/ProductionItems";

type ControlProductionProps = {
	productionId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlProduction({ productionId, closeModal, callbacks }: ControlProductionProps) {
	const { data: production, isLoading, isError, error } = useProductionById({ id: productionId });
	const {
		state,
		updateProduction: updateProductionState,
		addProductionInput,
		updateProductionInput,
		removeProductionInput,
		addProductionOutput,
		updateProductionOutput,
		removeProductionOutput,
		redefineState,
		resetState,
	} = useInternalProductionState({ initialState: {} });

	useEffect(() => {
		if (!production) return;
		redefineState({
			production: {
				receitaId: production.receitaId,
				titulo: production.titulo,
				origem: production.origem,
				status: production.status,
				vendaId: production.vendaId,
				vendaItemId: production.vendaItemId,
				dataInicio: toDate(production.dataInicio),
				dataPrevisaoConclusao: toDate(production.dataPrevisaoConclusao),
				dataConclusao: toDate(production.dataConclusao),
				observacoes: production.observacoes,
			},
			productionInputs: production.entradas.map((input) => ({
				id: input.id,
				produtoId: input.produtoId,
				produtoVarianteId: input.produtoVarianteId,
				quantidadePrevista: input.quantidadePrevista,
				quantidadeReal: input.quantidadeReal,
				produto: input.produto,
				produtoVariante: input.produtoVariante,
			})),
			productionOutputs: production.saidas.map((output) => ({
				id: output.id,
				produtoId: output.produtoId,
				produtoVarianteId: output.produtoVarianteId,
				quantidadePrevista: output.quantidadePrevista,
				quantidadeReal: output.quantidadeReal,
				prazoValidadeMedida: output.prazoValidadeMedida,
				prazoValidadeValor: output.prazoValidadeValor,
				dataValidade: toDate(output.dataValidade),
				produto: output.produto,
				produtoVariante: output.produtoVariante,
			})),
		});
	}, [production, redefineState]);

	const { mutate: handleUpdateProductionMutation, isPending } = useMutation({
		mutationKey: ["update-production", productionId],
		mutationFn: updateProduction,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			resetState();
			closeModal();
		},
		onError: (mutationError) => {
			callbacks?.onError?.(mutationError);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="ATUALIZAR PRODUÇÃO"
			menuDescription="Ajuste o planejamento e as quantidades reais desta produção."
			menuActionButtonText="ATUALIZAR PRODUÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateProductionMutation({ productionId, ...state })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<ProductionGeneralBlock production={state.production} updateProduction={updateProductionState} recipeSelectionEnabled={false} />
			<ProductionInputsBlock
				productionInputs={state.productionInputs}
				addProductionInput={addProductionInput}
				updateProductionInput={updateProductionInput}
				removeProductionInput={removeProductionInput}
			/>
			<ProductionOutputsBlock
				productionOutputs={state.productionOutputs}
				addProductionOutput={addProductionOutput}
				updateProductionOutput={updateProductionOutput}
				removeProductionOutput={removeProductionOutput}
			/>
		</ResponsiveMenu>
	);
}

function toDate(value: Date | string | null | undefined) {
	if (!value) return null;
	if (value instanceof Date) return value;
	return new Date(value);
}

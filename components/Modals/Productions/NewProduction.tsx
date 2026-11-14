import type { TCreateProductionInput } from "@/app/api/productions/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createProduction } from "@/lib/mutations/productions";
import { fetchProductionRecipeById } from "@/lib/queries/productions";
import { useInternalProductionState } from "@/state-hooks/use-internal-production-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import ProductionGeneralBlock from "./Blocks/ProductionGeneral";
import { ProductionInputsBlock, ProductionOutputsBlock } from "./Blocks/ProductionItems";

type NewProductionProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateProductionInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewProduction({ closeModal, callbacks }: NewProductionProps) {
	const {
		state,
		updateProduction,
		addProductionInput,
		updateProductionInput,
		removeProductionInput,
		addProductionOutput,
		updateProductionOutput,
		removeProductionOutput,
		redefineState,
		resetState,
	} = useInternalProductionState({ initialState: {} });

	async function handleRecipeChange(recipeId: string | null) {
		if (!recipeId) {
			redefineState({ production: { ...state.production, receitaId: null }, productionInputs: [], productionOutputs: [] });
			return;
		}

		try {
			const recipe = await fetchProductionRecipeById({ id: recipeId });
			redefineState({
				production: { ...state.production, receitaId: recipe.id, titulo: state.production.titulo || recipe.titulo },
				productionInputs: recipe.insumos.map((input) => ({
					produtoId: input.produtoId,
					produtoVarianteId: input.produtoVarianteId,
					quantidadePrevista: input.quantidade,
					quantidadeReal: null,
					produto: input.produto,
					produtoVariante: input.produtoVariante,
				})),
				productionOutputs: recipe.saidas.map((output) => ({
					produtoId: output.produtoId,
					produtoVarianteId: output.produtoVarianteId,
					quantidadePrevista: output.quantidade,
					quantidadeReal: null,
					prazoValidadeMedida: output.prazoValidadeMedida,
					prazoValidadeValor: output.prazoValidadeValor,
					dataValidade: null,
					produto: output.produto,
					produtoVariante: output.produtoVariante,
				})),
			});
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}

	const { mutate: handleCreateProductionMutation, isPending } = useMutation({
		mutationKey: ["create-production"],
		mutationFn: createProduction,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			resetState();
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVA PRODUÇÃO"
			menuDescription="Planeje ou registre uma produção operacional."
			menuActionButtonText="CRIAR PRODUÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateProductionMutation(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<ProductionGeneralBlock production={state.production} updateProduction={updateProduction} onRecipeChange={handleRecipeChange} />
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

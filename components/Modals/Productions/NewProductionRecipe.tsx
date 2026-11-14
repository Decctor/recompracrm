import type { TCreateProductionRecipeInput } from "@/app/api/productions/recipes/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createProductionRecipe } from "@/lib/mutations/productions";
import { useInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import ProductionRecipeGeneralBlock from "./Blocks/General";
import ProductionRecipePreparationMethodBlock from "./Blocks/PreparationMethod";
import { ProductionRecipeInputsBlock, ProductionRecipeOutputsBlock } from "./Blocks/RecipeItems";

type NewProductionRecipeProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateProductionRecipeInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewProductionRecipe({ closeModal, callbacks }: NewProductionRecipeProps) {
	const {
		state,
		updateProductionRecipe,
		addProductionRecipeInput,
		updateProductionRecipeInput,
		removeProductionRecipeInput,
		addProductionRecipeOutput,
		updateProductionRecipeOutput,
		removeProductionRecipeOutput,
		resetState,
	} = useInternalProductionRecipeState({ initialState: {} });

	const { mutate: handleCreateProductionRecipeMutation, isPending } = useMutation({
		mutationKey: ["create-production-recipe"],
		mutationFn: createProductionRecipe,
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
			menuTitle="NOVA RECEITA"
			menuDescription="Cadastre uma ficha técnica de produção."
			menuActionButtonText="CRIAR RECEITA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateProductionRecipeMutation(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<ProductionRecipeGeneralBlock productionRecipe={state.productionRecipe} updateProductionRecipe={updateProductionRecipe} />
			<ProductionRecipePreparationMethodBlock productionRecipe={state.productionRecipe} updateProductionRecipe={updateProductionRecipe} />
			<ProductionRecipeInputsBlock
				productionRecipeInputs={state.productionRecipeInputs}
				addProductionRecipeInput={addProductionRecipeInput}
				updateProductionRecipeInput={updateProductionRecipeInput}
				removeProductionRecipeInput={removeProductionRecipeInput}
			/>
			<ProductionRecipeOutputsBlock
				productionRecipeOutputs={state.productionRecipeOutputs}
				addProductionRecipeOutput={addProductionRecipeOutput}
				updateProductionRecipeOutput={updateProductionRecipeOutput}
				removeProductionRecipeOutput={removeProductionRecipeOutput}
			/>
		</ResponsiveMenu>
	);
}

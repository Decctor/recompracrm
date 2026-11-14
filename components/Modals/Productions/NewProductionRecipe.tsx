import type { TCreateProductionRecipeInput } from "@/app/api/productions/recipes/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { createProductionRecipe } from "@/lib/mutations/productions";
import { DEFAULT_RECIPE_COVER_ICON, RECIPE_COVER_HUES } from "@/lib/productions/recipe-cover";
import { type TProductionRecipeState, useInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import ProductionRecipeGeneralBlock from "./Blocks/General";
import ProductionRecipePreparationMethodBlock from "./Blocks/PreparationMethod";
import ProductionRecipeCoverBlock from "./Blocks/RecipeCover";
import { ProductionRecipeInputsBlock, ProductionRecipeOutputsBlock } from "./Blocks/RecipeItems";

type NewProductionRecipeProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TProductionRecipeState) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Sobe a foto escolhida (se houver) e monta o payload da API — o holder do arquivo não viaja. */
async function handleCreateProductionRecipe(state: TProductionRecipeState) {
	const { imagemCapaHolder, ...productionRecipe } = state.productionRecipe;
	let imagemCapaUrl = productionRecipe.imagemCapaUrl ?? null;
	if (imagemCapaHolder.file) {
		const { url } = await uploadFile({ file: imagemCapaHolder.file, fileName: productionRecipe.titulo || "receita", prefix: "syncrono" });
		imagemCapaUrl = url;
	}
	const input: TCreateProductionRecipeInput = {
		productionRecipe: { ...productionRecipe, imagemCapaUrl },
		productionRecipeInputs: state.productionRecipeInputs,
		productionRecipeOutputs: state.productionRecipeOutputs,
	};
	return await createProductionRecipe(input);
}

export default function NewProductionRecipe({ closeModal, callbacks }: NewProductionRecipeProps) {
	// Receita nova já nasce com ícone e cor: a prévia do modal é exatamente a capa que será salva.
	const [initialCoverHue] = useState(() => RECIPE_COVER_HUES[Math.floor(Math.random() * RECIPE_COVER_HUES.length)]);
	const {
		state,
		updateProductionRecipe,
		updateProductionRecipeCoverHolder,
		addProductionRecipeInput,
		updateProductionRecipeInput,
		removeProductionRecipeInput,
		addProductionRecipeOutput,
		updateProductionRecipeOutput,
		removeProductionRecipeOutput,
		resetState,
	} = useInternalProductionRecipeState({
		initialState: { productionRecipe: { capaIcone: DEFAULT_RECIPE_COVER_ICON, capaCor: initialCoverHue } },
	});

	const { mutate: handleCreateProductionRecipeMutation, isPending } = useMutation({
		mutationKey: ["create-production-recipe"],
		mutationFn: handleCreateProductionRecipe,
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
			<ProductionRecipeCoverBlock
				productionRecipe={state.productionRecipe}
				updateProductionRecipe={updateProductionRecipe}
				updateProductionRecipeCoverHolder={updateProductionRecipeCoverHolder}
			/>
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

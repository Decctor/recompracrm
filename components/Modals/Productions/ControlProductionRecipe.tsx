import type { TUpdateProductionRecipeInput } from "@/app/api/productions/recipes/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { updateProductionRecipe } from "@/lib/mutations/productions";
import { useProductionRecipeById } from "@/lib/queries/productions";
import { type TProductionRecipeState, useInternalProductionRecipeState } from "@/state-hooks/use-internal-production-recipe-state";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import ProductionRecipeGeneralBlock from "./Blocks/General";
import ProductionRecipePreparationMethodBlock from "./Blocks/PreparationMethod";
import ProductionRecipeCoverBlock from "./Blocks/RecipeCover";
import { ProductionRecipeInputsBlock, ProductionRecipeOutputsBlock } from "./Blocks/RecipeItems";

type ControlProductionRecipeProps = {
	productionRecipeId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Sobe a foto nova (se houver) e monta o payload da API — o holder do arquivo não viaja. */
async function handleUpdateProductionRecipe({ productionRecipeId, state }: { productionRecipeId: string; state: TProductionRecipeState }) {
	const { imagemCapaHolder, ...productionRecipe } = state.productionRecipe;
	let imagemCapaUrl = productionRecipe.imagemCapaUrl ?? null;
	if (imagemCapaHolder.file) {
		const { url } = await uploadFile({ file: imagemCapaHolder.file, fileName: productionRecipe.titulo || "receita", prefix: "syncrono" });
		imagemCapaUrl = url;
	}
	const input: TUpdateProductionRecipeInput = {
		productionRecipeId,
		productionRecipe: { ...productionRecipe, imagemCapaUrl },
		productionRecipeInputs: state.productionRecipeInputs,
		productionRecipeOutputs: state.productionRecipeOutputs,
	};
	return await updateProductionRecipe(input);
}

export default function ControlProductionRecipe({ productionRecipeId, closeModal, callbacks }: ControlProductionRecipeProps) {
	const { data: productionRecipe, isLoading, isError, error } = useProductionRecipeById({ id: productionRecipeId });
	const {
		state,
		updateProductionRecipe: updateRecipeState,
		updateProductionRecipeCoverHolder,
		addProductionRecipeInput,
		updateProductionRecipeInput,
		removeProductionRecipeInput,
		addProductionRecipeOutput,
		updateProductionRecipeOutput,
		removeProductionRecipeOutput,
		redefineState,
		resetState,
	} = useInternalProductionRecipeState({ initialState: {} });

	useEffect(() => {
		if (!productionRecipe) return;
		redefineState({
			productionRecipe: {
				titulo: productionRecipe.titulo,
				descricao: productionRecipe.descricao,
				modoPreparo: productionRecipe.modoPreparo,
				previsaoTempoMedida: productionRecipe.previsaoTempoMedida,
				previsaoTempoValor: productionRecipe.previsaoTempoValor,
				imagemCapaUrl: productionRecipe.imagemCapaUrl,
				capaIcone: productionRecipe.capaIcone,
				capaCor: productionRecipe.capaCor,
				ativo: productionRecipe.ativo,
				imagemCapaHolder: { file: null, previewUrl: null },
			},
			productionRecipeInputs: productionRecipe.insumos.map((input) => ({
				id: input.id,
				produtoId: input.produtoId,
				produtoVarianteId: input.produtoVarianteId,
				quantidade: input.quantidade,
				produto: input.produto,
				produtoVariante: input.produtoVariante,
			})),
			productionRecipeOutputs: productionRecipe.saidas.map((output) => ({
				id: output.id,
				produtoId: output.produtoId,
				produtoVarianteId: output.produtoVarianteId,
				quantidade: output.quantidade,
				prazoValidadeMedida: output.prazoValidadeMedida,
				prazoValidadeValor: output.prazoValidadeValor,
				produto: output.produto,
				produtoVariante: output.produtoVariante,
			})),
		});
	}, [productionRecipe, redefineState]);

	const { mutate: handleUpdateProductionRecipeMutation, isPending } = useMutation({
		mutationKey: ["update-production-recipe", productionRecipeId],
		mutationFn: handleUpdateProductionRecipe,
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
			menuTitle="ATUALIZAR RECEITA"
			menuDescription="Ajuste a ficha técnica de produção."
			menuActionButtonText="ATUALIZAR RECEITA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleUpdateProductionRecipeMutation({ productionRecipeId, state })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<ProductionRecipeGeneralBlock productionRecipe={state.productionRecipe} updateProductionRecipe={updateRecipeState} />
			<ProductionRecipeCoverBlock
				recipeId={productionRecipeId}
				productionRecipe={state.productionRecipe}
				updateProductionRecipe={updateRecipeState}
				updateProductionRecipeCoverHolder={updateProductionRecipeCoverHolder}
			/>
			<ProductionRecipePreparationMethodBlock productionRecipe={state.productionRecipe} updateProductionRecipe={updateRecipeState} />
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

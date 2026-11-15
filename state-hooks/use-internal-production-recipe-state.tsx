import { ProductionRecipeBaseSchema, ProductionRecipeInputSchema, ProductionRecipeOutputBaseSchema } from "@/schemas/productions";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

const ProductionRecipeStateSchema = z.object({
	productionRecipe: ProductionRecipeBaseSchema.omit({ organizacaoId: true, dataInsercao: true }).extend({
		/** Foto escolhida e ainda não enviada: o upload acontece ao salvar, e a URL vai em `imagemCapaUrl`. */
		imagemCapaHolder: z.object({
			file: z.instanceof(File).optional().nullable(),
			previewUrl: z.string().optional().nullable(),
		}),
	}),
	productionRecipeInputs: z.array(
		ProductionRecipeInputSchema.omit({ organizacaoId: true, receitaId: true }).extend({
			id: z.string().optional().nullable(),
			deletar: z.boolean().optional().nullable(),
			produto: z
				.object({
					id: z.string(),
					nome: z.string(),
					codigo: z.string().nullable().optional(),
					imagemCapaUrl: z.string().nullable().optional(),
				})
				.optional()
				.nullable(),
			produtoVariante: z
				.object({
					id: z.string(),
					nome: z.string(),
					codigo: z.string().nullable().optional(),
					imagemCapaUrl: z.string().nullable().optional(),
				})
				.optional()
				.nullable(),
		}),
	),
	productionRecipeOutputs: z.array(
		ProductionRecipeOutputBaseSchema.omit({ organizacaoId: true, receitaId: true }).extend({
			id: z.string().optional().nullable(),
			deletar: z.boolean().optional().nullable(),
			produto: z
				.object({
					id: z.string(),
					nome: z.string(),
					codigo: z.string().nullable().optional(),
					imagemCapaUrl: z.string().nullable().optional(),
				})
				.optional()
				.nullable(),
			produtoVariante: z
				.object({
					id: z.string(),
					nome: z.string(),
					codigo: z.string().nullable().optional(),
					imagemCapaUrl: z.string().nullable().optional(),
				})
				.optional()
				.nullable(),
		}),
	),
});

export type TProductionRecipeState = z.infer<typeof ProductionRecipeStateSchema>;

type UseInternalProductionRecipeStateProps = {
	initialState?: {
		productionRecipe?: Partial<TProductionRecipeState["productionRecipe"]>;
		productionRecipeInputs?: TProductionRecipeState["productionRecipeInputs"];
		productionRecipeOutputs?: TProductionRecipeState["productionRecipeOutputs"];
	};
};

const DEFAULT_RECIPE: TProductionRecipeState["productionRecipe"] = {
	titulo: "",
	descricao: null,
	modoPreparo: null,
	previsaoTempoMedida: null,
	previsaoTempoValor: null,
	imagemCapaUrl: null,
	capaIcone: null,
	capaCor: null,
	ativo: true,
	imagemCapaHolder: { file: null, previewUrl: null },
};

export function useInternalProductionRecipeState({ initialState }: UseInternalProductionRecipeStateProps) {
	const [state, setState] = useState<TProductionRecipeState>({
		productionRecipe: {
			...DEFAULT_RECIPE,
			...initialState?.productionRecipe,
			imagemCapaHolder: {
				file: initialState?.productionRecipe?.imagemCapaHolder?.file ?? null,
				previewUrl: initialState?.productionRecipe?.imagemCapaHolder?.previewUrl ?? null,
			},
		},
		productionRecipeInputs: initialState?.productionRecipeInputs ?? [],
		productionRecipeOutputs: initialState?.productionRecipeOutputs ?? [],
	});

	// A prévia da foto escolhida é um `blob:` que vive até ser revogado: solta a anterior quando a foto é
	// trocada ou removida, e a última quando o modal fecha.
	const coverPreviewUrl = state.productionRecipe.imagemCapaHolder.previewUrl;
	useEffect(() => {
		if (!coverPreviewUrl?.startsWith("blob:")) return;
		return () => URL.revokeObjectURL(coverPreviewUrl);
	}, [coverPreviewUrl]);

	const updateProductionRecipe = useCallback((productionRecipe: Partial<Omit<TProductionRecipeState["productionRecipe"], "imagemCapaHolder">>) => {
		setState((prev) => ({
			...prev,
			productionRecipe: { ...prev.productionRecipe, ...productionRecipe },
		}));
	}, []);

	const updateProductionRecipeCoverHolder = useCallback((holder: Partial<TProductionRecipeState["productionRecipe"]["imagemCapaHolder"]>) => {
		setState((prev) => ({
			...prev,
			productionRecipe: {
				...prev.productionRecipe,
				imagemCapaHolder: { ...prev.productionRecipe.imagemCapaHolder, ...holder },
			},
		}));
	}, []);

	const addProductionRecipeInput = useCallback((input: TProductionRecipeState["productionRecipeInputs"][number]) => {
		setState((prev) => ({
			...prev,
			productionRecipeInputs: [...prev.productionRecipeInputs, input],
		}));
	}, []);

	const updateProductionRecipeInput = useCallback((index: number, input: Partial<TProductionRecipeState["productionRecipeInputs"][number]>) => {
		setState((prev) => ({
			...prev,
			productionRecipeInputs: prev.productionRecipeInputs.map((current, currentIndex) => (currentIndex === index ? { ...current, ...input } : current)),
		}));
	}, []);

	const removeProductionRecipeInput = useCallback((index: number) => {
		setState((prev) => {
			const target = prev.productionRecipeInputs[index];
			if (!target?.id) {
				return {
					...prev,
					productionRecipeInputs: prev.productionRecipeInputs.filter((_, currentIndex) => currentIndex !== index),
				};
			}
			return {
				...prev,
				productionRecipeInputs: prev.productionRecipeInputs.map((current, currentIndex) =>
					currentIndex === index ? { ...current, deletar: true } : current,
				),
			};
		});
	}, []);

	const addProductionRecipeOutput = useCallback((output: TProductionRecipeState["productionRecipeOutputs"][number]) => {
		setState((prev) => ({
			...prev,
			productionRecipeOutputs: [...prev.productionRecipeOutputs, output],
		}));
	}, []);

	const updateProductionRecipeOutput = useCallback((index: number, output: Partial<TProductionRecipeState["productionRecipeOutputs"][number]>) => {
		setState((prev) => ({
			...prev,
			productionRecipeOutputs: prev.productionRecipeOutputs.map((current, currentIndex) =>
				currentIndex === index ? { ...current, ...output } : current,
			),
		}));
	}, []);

	const removeProductionRecipeOutput = useCallback((index: number) => {
		setState((prev) => {
			const target = prev.productionRecipeOutputs[index];
			if (!target?.id) {
				return {
					...prev,
					productionRecipeOutputs: prev.productionRecipeOutputs.filter((_, currentIndex) => currentIndex !== index),
				};
			}
			return {
				...prev,
				productionRecipeOutputs: prev.productionRecipeOutputs.map((current, currentIndex) =>
					currentIndex === index ? { ...current, deletar: true } : current,
				),
			};
		});
	}, []);

	const redefineState = useCallback((newState: TProductionRecipeState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState({
			productionRecipe: DEFAULT_RECIPE,
			productionRecipeInputs: [],
			productionRecipeOutputs: [],
		});
	}, []);

	return {
		state,
		updateProductionRecipe,
		updateProductionRecipeCoverHolder,
		addProductionRecipeInput,
		updateProductionRecipeInput,
		removeProductionRecipeInput,
		addProductionRecipeOutput,
		updateProductionRecipeOutput,
		removeProductionRecipeOutput,
		redefineState,
		resetState,
	};
}

export type TUseInternalProductionRecipeState = ReturnType<typeof useInternalProductionRecipeState>;

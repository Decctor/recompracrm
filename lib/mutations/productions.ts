import type {
	TCreateProductionInput,
	TCreateProductionOutput,
	TDeleteProductionInput,
	TDeleteProductionOutput,
	TUpdateProductionInput,
	TUpdateProductionOutput,
} from "@/app/api/productions/route";
import type { TCompleteProductionInput, TCompleteProductionOutput } from "@/app/api/productions/complete/route";
import type { TWeighProductionItemInput, TWeighProductionItemOutput } from "@/app/api/productions/items/route";
import type { TStartProductionInput, TStartProductionOutput } from "@/app/api/productions/start/route";
import type {
	TCreateProductionRecipeInput,
	TCreateProductionRecipeOutput,
	TDeleteProductionRecipeInput,
	TDeleteProductionRecipeOutput,
	TUpdateProductionRecipeInput,
	TUpdateProductionRecipeOutput,
} from "@/app/api/productions/recipes/route";
import axios from "axios";

export async function completeProduction(input: TCompleteProductionInput) {
	const { data } = await axios.post<TCompleteProductionOutput>("/api/productions/complete", input);
	return data;
}

export async function startProduction(input: TStartProductionInput) {
	const { data } = await axios.post<TStartProductionOutput>("/api/productions/start", input);
	return data;
}

export async function weighProductionItem(input: TWeighProductionItemInput) {
	const { data } = await axios.patch<TWeighProductionItemOutput>("/api/productions/items", input);
	return data;
}

export async function createProduction(input: TCreateProductionInput) {
	const { data } = await axios.post<TCreateProductionOutput>("/api/productions", input);
	return data;
}

export async function updateProduction(input: TUpdateProductionInput) {
	const { data } = await axios.put<TUpdateProductionOutput>("/api/productions", input);
	return data;
}

export async function deleteProduction(input: TDeleteProductionInput) {
	const { data } = await axios.delete<TDeleteProductionOutput>(`/api/productions?productionId=${input.productionId}`);
	return data;
}

export async function createProductionRecipe(input: TCreateProductionRecipeInput) {
	const { data } = await axios.post<TCreateProductionRecipeOutput>("/api/productions/recipes", input);
	return data;
}

export async function updateProductionRecipe(input: TUpdateProductionRecipeInput) {
	const { data } = await axios.put<TUpdateProductionRecipeOutput>("/api/productions/recipes", input);
	return data;
}

export async function deleteProductionRecipe(input: TDeleteProductionRecipeInput) {
	const { data } = await axios.delete<TDeleteProductionRecipeOutput>(`/api/productions/recipes?productionRecipeId=${input.productionRecipeId}`);
	return data;
}

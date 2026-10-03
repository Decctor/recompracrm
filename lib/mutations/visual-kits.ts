import type {
	TCreateVisualKitInput,
	TCreateVisualKitOutput,
	TDeleteVisualKitOutput,
	TUpdateVisualKitInput,
	TUpdateVisualKitOutput,
} from "@/app/api/visual-kits/route";
import type { TCompleteVisualKitGenerationInput, TCompleteVisualKitGenerationOutput } from "@/app/api/visual-kits/generation/route";
import type { TCreateVisualKitUploadsInput, TCreateVisualKitUploadsOutput } from "@/app/api/visual-kits/uploads/route";
import axios from "axios";

export async function createVisualKit(input: TCreateVisualKitInput) {
	const { data } = await axios.post<TCreateVisualKitOutput>("/api/visual-kits", input);
	return data;
}

export async function updateVisualKit(input: TUpdateVisualKitInput) {
	const { data } = await axios.put<TUpdateVisualKitOutput>("/api/visual-kits", input);
	return data;
}

export async function deleteVisualKit(input: { id: string }) {
	const { data } = await axios.delete<TDeleteVisualKitOutput>(`/api/visual-kits?id=${input.id}`);
	return data;
}

export async function createVisualKitUploads(input: TCreateVisualKitUploadsInput) {
	const { data } = await axios.post<TCreateVisualKitUploadsOutput>("/api/visual-kits/uploads", input);
	return data;
}

export async function completeVisualKitGeneration(input: TCompleteVisualKitGenerationInput) {
	const { data } = await axios.post<TCompleteVisualKitGenerationOutput>("/api/visual-kits/generation", input);
	return data;
}

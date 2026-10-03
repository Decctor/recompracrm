import type {
	TCreateVisualKitInput,
	TCreateVisualKitOutput,
	TDeleteVisualKitOutput,
	TUpdateVisualKitInput,
	TUpdateVisualKitOutput,
} from "@/app/api/visual-kits/route";
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

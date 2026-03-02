import type {
	TCreateClientLocationInput,
	TCreateClientLocationOutput,
	TUpdateClientLocationInput,
	TUpdateClientLocationOutput,
} from "@/pages/api/clients/locations";
import axios from "axios";

export async function createClientLocation(input: TCreateClientLocationInput) {
	const { data } = await axios.post<TCreateClientLocationOutput>("/api/clients/locations", input);
	return data;
}

export async function updateClientLocation(input: TUpdateClientLocationInput) {
	const { data } = await axios.put<TUpdateClientLocationOutput>(`/api/clients/locations?id=${input.id}`, input);
	return data;
}

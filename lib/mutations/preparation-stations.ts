import type {
	TCreatePreparationStationInput,
	TCreatePreparationStationOutput,
	TDeletePreparationStationInput,
	TDeletePreparationStationOutput,
	TUpdatePreparationStationInput,
	TUpdatePreparationStationOutput,
} from "@/app/api/preparation-stations/route";
import axios from "axios";

export async function createPreparationStation(input: TCreatePreparationStationInput) {
	const { data } = await axios.post<TCreatePreparationStationOutput>("/api/preparation-stations", input);
	return data;
}

// Envia a estação inteira: a lista de regras substitui a anterior.
export async function updatePreparationStation(input: TUpdatePreparationStationInput) {
	const { data } = await axios.put<TUpdatePreparationStationOutput>("/api/preparation-stations", input);
	return data;
}

export async function deletePreparationStation(input: TDeletePreparationStationInput) {
	const { data } = await axios.delete<TDeletePreparationStationOutput>(`/api/preparation-stations?id=${input.id}`);
	return data;
}

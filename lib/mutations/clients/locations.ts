import type {
	TCreateClientLocationInput,
	TCreateClientLocationOutput,
	TUpdateClientLocationInput,
	TUpdateClientLocationOutput,
} from "@/app/api/clients/locations/route";
import type { TParseClientLocationAddressInput, TParseClientLocationAddressOutput } from "@/app/api/clients/locations/parse-address/route";
import axios from "axios";

export async function createClientLocation(input: TCreateClientLocationInput) {
	const { data } = await axios.post<TCreateClientLocationOutput>("/api/clients/locations", input);
	return data;
}

export async function updateClientLocation(input: TUpdateClientLocationInput) {
	const { data } = await axios.put<TUpdateClientLocationOutput>(`/api/clients/locations?id=${input.id}`, input);
	return data;
}

export async function parseClientLocationAddress(input: TParseClientLocationAddressInput) {
	const { data } = await axios.post<TParseClientLocationAddressOutput>("/api/clients/locations/parse-address", input);
	return data;
}

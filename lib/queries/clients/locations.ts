import type {
	TGetClientLocationByIdInput,
	TGetClientLocationByIdOutput,
	TGetClientLocationsInput,
	TGetClientLocationsOutput,
} from "@/pages/api/clients/locations";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export async function fetchClientLocations(input: TGetClientLocationsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("clienteId", input.clienteId);
	const { data } = await axios.get<TGetClientLocationsOutput>(`/api/clients/locations?${searchParams.toString()}`);
	return data.data.locations;
}

export function useClientLocations({ clienteId }: { clienteId: string | null | undefined }) {
	const queryKey = ["client-locations", clienteId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchClientLocations({ clienteId: clienteId as string }),
			enabled: !!clienteId,
		}),
		queryKey,
	};
}

export async function fetchClientLocationById(input: TGetClientLocationByIdInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("id", input.id);
	const { data } = await axios.get<TGetClientLocationByIdOutput>(`/api/clients/locations?${searchParams.toString()}`);
	return data.data.location;
}

export function useClientLocationById({ id }: { id: string | null | undefined }) {
	const queryKey = ["client-location-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchClientLocationById({ id: id as string }),
			enabled: !!id,
		}),
		queryKey,
	};
}

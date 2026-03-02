import type {
	TCreateClientViaPointOfInteractionInput,
	TCreateClientViaPointOfInteractionOutput,
} from "@/app/api/point-of-interaction/new-client/route";
import type { TCreateClientInput, TCreateClientOutput } from "@/pages/api/clients";
import type { TBulkCreateClientsInput, TBulkCreateClientsOutput } from "@/pages/api/clients/bulk";
import axios from "axios";

export async function createClient(info: TCreateClientInput) {
	const { data } = await axios.post<TCreateClientOutput>("/api/clients", info);
	return data;
}

export async function bulkCreateClients(info: TBulkCreateClientsInput, onUploadProgress?: (progress: number) => void) {
	const { data } = await axios.post<TBulkCreateClientsOutput>("/api/clients/bulk", info, {
		onUploadProgress: (progressEvent) => onUploadProgress?.(Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? 1))),
	});
	return data;
}

export async function createClientViaPointOfInteraction(info: TCreateClientViaPointOfInteractionInput) {
	const { data } = await axios.post<TCreateClientViaPointOfInteractionOutput>("/api/point-of-interaction/new-client", info);
	return data;
}

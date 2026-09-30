import type { TGetAddOnChannelSettingsOutput } from "@/app/api/products/add-ons/channel-settings/route";
import type { TGetProductChannelSettingsOutput } from "@/app/api/products/channel-settings/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchProductChannelSettings(produtoId: string) {
	const { data } = await axios.get<TGetProductChannelSettingsOutput>(`/api/products/channel-settings?produtoId=${produtoId}`);
	return data.data;
}

export function useProductChannelSettings({ produtoId, enabled = true }: { produtoId: string; enabled?: boolean }) {
	const queryKey = ["product-channel-settings", produtoId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchProductChannelSettings(produtoId),
			// A rota exige sessão ERP: sem o recurso, a requisição seria um 403 garantido.
			enabled,
		}),
		queryKey,
	};
}

async function fetchAddOnChannelSettings(produtoAddOnId: string) {
	const { data } = await axios.get<TGetAddOnChannelSettingsOutput>(`/api/products/add-ons/channel-settings?produtoAddOnId=${produtoAddOnId}`);
	return data.data;
}

/** Preço e disponibilidade das opções de um grupo de adicionais em cada canal (linhas esparsas). */
export function useAddOnChannelSettings({ produtoAddOnId, enabled = true }: { produtoAddOnId: string; enabled?: boolean }) {
	const queryKey = ["add-on-channel-settings", produtoAddOnId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchAddOnChannelSettings(produtoAddOnId),
			enabled,
		}),
		queryKey,
	};
}

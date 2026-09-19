import type { TCreateShopOrderOutput } from "@/app/api/shop/[orgId]/orders/route";
import type { TCreateShopSettingsOutput, TUpdateShopSettingsInput, TUpdateShopSettingsOutput } from "@/app/api/shop/settings/route";
import type { TCreateShopOrderInput } from "@/schemas/shop";
import axios from "axios";

export async function createShopOrder({ orgId, input }: { orgId: string; input: TCreateShopOrderInput }) {
	const { data } = await axios.post<TCreateShopOrderOutput>(`/api/shop/${orgId}/orders`, input);
	return data;
}

export async function updateShopSettings(input: TUpdateShopSettingsInput) {
	const { data } = await axios.put<TUpdateShopSettingsOutput>("/api/shop/settings", input);
	return data;
}

export async function createShopSettings() {
	const { data } = await axios.post<TCreateShopSettingsOutput>("/api/shop/settings");
	return data;
}

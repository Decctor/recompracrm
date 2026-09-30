import type { TUpdateAddOnChannelSettingsInput, TUpdateAddOnChannelSettingsOutput } from "@/app/api/products/add-ons/channel-settings/route";
import type { TUpdateProductChannelSettingsInput, TUpdateProductChannelSettingsOutput } from "@/app/api/products/channel-settings/route";
import axios from "axios";

export async function updateProductChannelSettings(input: TUpdateProductChannelSettingsInput) {
	const { data } = await axios.put<TUpdateProductChannelSettingsOutput>("/api/products/channel-settings", input);
	return data;
}

export async function updateAddOnChannelSettings(input: TUpdateAddOnChannelSettingsInput) {
	const { data } = await axios.put<TUpdateAddOnChannelSettingsOutput>("/api/products/add-ons/channel-settings", input);
	return data;
}

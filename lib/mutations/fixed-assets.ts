import type { TFixedAssetActionInput, TFixedAssetActionOutput } from "@/app/api/fixed-assets/actions/route";
import type { TCreateFixedAssetInput, TCreateFixedAssetOutput, TUpdateFixedAssetInput, TUpdateFixedAssetOutput } from "@/app/api/fixed-assets/route";
import axios from "axios";

export async function createFixedAsset(input: TCreateFixedAssetInput) {
	const { data } = await axios.post<TCreateFixedAssetOutput>("/api/fixed-assets", input);
	return data;
}

export async function updateFixedAsset(input: TUpdateFixedAssetInput) {
	const { data } = await axios.put<TUpdateFixedAssetOutput>("/api/fixed-assets", input);
	return data;
}

export async function runFixedAssetAction(input: TFixedAssetActionInput) {
	const { data } = await axios.post<TFixedAssetActionOutput>("/api/fixed-assets/actions", input);
	return data;
}

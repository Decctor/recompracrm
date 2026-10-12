import type { TCancelTabOutput, TCancelTabRouteInput } from "@/app/api/tabs/cancel/route";
import type { TDecideTabOrderRequestInput, TDecideTabOrderRequestOutput } from "@/app/api/tabs/order-requests/route";
import type { TUpdateTabClientInput, TUpdateTabClientOutput } from "@/app/api/tabs/client/route";
import type { TCloseTabOutput, TCloseTabRouteInput } from "@/app/api/tabs/close/route";
import type { TCreateTabOrderInput, TCreateTabOrderOutput } from "@/app/api/tabs/orders/route";
import type { TUpdateTabOrderStatusInput, TUpdateTabOrderStatusOutput } from "@/app/api/tabs/orders/status/route";
import type { TCreateTabInput, TCreateTabOutput } from "@/app/api/tabs/route";
import type { TTransferTabOutput, TTransferTabRouteInput } from "@/app/api/tabs/transfer/route";
import type { TCreateServicePointInput, TCreateServicePointOutput, TUpdateServicePointInput, TUpdateServicePointOutput } from "@/app/api/service-points/route";
import type { TUpdateServiceSettingsInput, TUpdateServiceSettingsOutput } from "@/app/api/service-settings/route";
import axios from "axios";

// ============================================================================
// SERVICE SETTINGS
// ============================================================================

export async function updateServiceSettings(input: TUpdateServiceSettingsInput) {
	const { data } = await axios.put<TUpdateServiceSettingsOutput>("/api/service-settings", input);
	return data;
}

// ============================================================================
// SERVICE POINTS
// ============================================================================

export async function createServicePoint(input: TCreateServicePointInput) {
	const { data } = await axios.post<TCreateServicePointOutput>("/api/service-points", input);
	return data;
}

export async function updateServicePoint(input: TUpdateServicePointInput) {
	const { data } = await axios.put<TUpdateServicePointOutput>(`/api/service-points?id=${input.id}`, input);
	return data;
}

// ============================================================================
// TABS
// ============================================================================

export async function createTab(input: TCreateTabInput) {
	const { data } = await axios.post<TCreateTabOutput>("/api/tabs", input);
	return data;
}

export async function createTabOrder(input: TCreateTabOrderInput) {
	const { data } = await axios.post<TCreateTabOrderOutput>("/api/tabs/orders", input);
	return data;
}

export async function updateTabOrderStatus(input: TUpdateTabOrderStatusInput) {
	const { data } = await axios.post<TUpdateTabOrderStatusOutput>("/api/tabs/orders/status", input);
	return data;
}

export async function closeTab(input: TCloseTabRouteInput) {
	const { data } = await axios.post<TCloseTabOutput>("/api/tabs/close", input);
	return data;
}

export async function cancelTabOrOrder(input: TCancelTabRouteInput) {
	const { data } = await axios.post<TCancelTabOutput>("/api/tabs/cancel", input);
	return data;
}

export async function transferTab(input: TTransferTabRouteInput) {
	const { data } = await axios.post<TTransferTabOutput>("/api/tabs/transfer", input);
	return data;
}

export async function updateTabClient(input: TUpdateTabClientInput) {
	const { data } = await axios.post<TUpdateTabClientOutput>("/api/tabs/client", input);
	return data;
}

export async function decideTabOrderRequest(input: TDecideTabOrderRequestInput) {
	const { data } = await axios.post<TDecideTabOrderRequestOutput>("/api/tabs/order-requests", input);
	return data;
}

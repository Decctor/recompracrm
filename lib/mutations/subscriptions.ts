import type { TBillingPortalOutput } from "@/app/api/integrations/stripe/billing-portal/route";
import type { TGenerateCheckoutInput, TGenerateCheckoutOutput } from "@/app/api/integrations/stripe/generate-checkout/route";
import type {
	TAddSubscriptionAddonInput,
	TAddSubscriptionAddonOutput,
	TRemoveSubscriptionAddonInput,
	TRemoveSubscriptionAddonOutput,
} from "@/app/api/organizations/subscription/addons/route";
import axios from "axios";

export async function generateSubscriptionCheckout(input: TGenerateCheckoutInput) {
	const { data } = await axios.post<TGenerateCheckoutOutput>("/api/integrations/stripe/generate-checkout", input);
	return data;
}

export async function openBillingPortal() {
	const { data } = await axios.post<TBillingPortalOutput>("/api/integrations/stripe/billing-portal");
	return data;
}

export async function addSubscriptionAddon(input: TAddSubscriptionAddonInput) {
	const { data } = await axios.post<TAddSubscriptionAddonOutput>("/api/organizations/subscription/addons", input);
	return data;
}

export async function removeSubscriptionAddon(input: TRemoveSubscriptionAddonInput) {
	const searchParams = new URLSearchParams({ addon: input.addon });
	const { data } = await axios.delete<TRemoveSubscriptionAddonOutput>(`/api/organizations/subscription/addons?${searchParams.toString()}`);
	return data;
}

import type { TCompleteOnboardingInput, TCompleteOnboardingOutput } from "@/app/api/organizations/onboarding/route";
import type { TEnableOnboardingCampaignsInput, TEnableOnboardingCampaignsOutput } from "@/app/api/organizations/onboarding/campaigns/enable/route";
import type { TSeedOnboardingCampaignsInput, TSeedOnboardingCampaignsOutput } from "@/app/api/organizations/onboarding/campaigns/route";
import type { TUpsertOnboardingCashbackInput, TUpsertOnboardingCashbackOutput } from "@/app/api/organizations/onboarding/cashback/route";
import type { TCreateJourneyInput, TCreateJourneyOutput } from "@/app/api/organizations/onboarding/journeys/route";
import type { TUpdateJourneyProgressInput, TUpdateJourneyProgressOutput } from "@/app/api/organizations/onboarding/progress/route";
import type { TConfirmWhatsappPaymentInput, TConfirmWhatsappPaymentOutput } from "@/app/api/organizations/onboarding/whatsapp-payment/route";
import type { TRequestWhatsappAssistOutput } from "@/app/api/organizations/onboarding/whatsapp-assist/route";
import axios from "axios";

export async function createOnboardingJourney(input: TCreateJourneyInput) {
	const { data } = await axios.post<TCreateJourneyOutput>("/api/organizations/onboarding/journeys", input);
	return data;
}

export async function updateOnboardingProgress(input: TUpdateJourneyProgressInput) {
	const { data } = await axios.put<TUpdateJourneyProgressOutput>("/api/organizations/onboarding/progress", input);
	return data;
}

export async function completeOnboarding(input: TCompleteOnboardingInput) {
	const { data } = await axios.post<TCompleteOnboardingOutput>("/api/organizations/onboarding", input);
	return data;
}

export async function upsertOnboardingCashback(input: TUpsertOnboardingCashbackInput) {
	const { data } = await axios.post<TUpsertOnboardingCashbackOutput>("/api/organizations/onboarding/cashback", input);
	return data;
}

export async function seedOnboardingCampaigns(input: TSeedOnboardingCampaignsInput) {
	const { data } = await axios.post<TSeedOnboardingCampaignsOutput>("/api/organizations/onboarding/campaigns", input);
	return data;
}

export async function enableOnboardingCampaigns(input: TEnableOnboardingCampaignsInput) {
	const { data } = await axios.post<TEnableOnboardingCampaignsOutput>("/api/organizations/onboarding/campaigns/enable", input);
	return data;
}

export async function confirmWhatsappPayment(input: TConfirmWhatsappPaymentInput) {
	const { data } = await axios.put<TConfirmWhatsappPaymentOutput>("/api/organizations/onboarding/whatsapp-payment", input);
	return data;
}

export async function requestWhatsappAssist() {
	const { data } = await axios.post<TRequestWhatsappAssistOutput>("/api/organizations/onboarding/whatsapp-assist", {});
	return data;
}

import type {
	TUpdateAdminPlatformPartnerCommissionInput,
	TUpdateAdminPlatformPartnerCommissionOutput,
} from "@/app/api/admin/platform-partners/commissions/route";
import type {
	TCreateAdminPlatformPartnerPayoutInput,
	TCreateAdminPlatformPartnerPayoutOutput,
	TUpdateAdminPlatformPartnerPayoutInput,
	TUpdateAdminPlatformPartnerPayoutOutput,
} from "@/app/api/admin/platform-partners/payouts/route";
import type {
	TCreateAdminPlatformPartnerInput,
	TCreateAdminPlatformPartnerOutput,
	TUpdateAdminPlatformPartnerInput,
	TUpdateAdminPlatformPartnerOutput,
} from "@/app/api/admin/platform-partners/route";
import type {
	TCreateAdminPlatformPartnerPayoutReceiptInput,
	TCreateAdminPlatformPartnerPayoutReceiptOutput,
} from "@/app/api/admin/platform-partners/payouts/receipt/route";
import type {
	TResolveAdminPlatformPartnerChangeRequestInput,
	TResolveAdminPlatformPartnerChangeRequestOutput,
} from "@/app/api/admin/platform-partners/change-requests/route";
import type {
	TCreatePlatformPartnerChangeRequestInput,
	TCreatePlatformPartnerChangeRequestOutput,
	TDeletePlatformPartnerChangeRequestOutput,
} from "@/app/api/platform-partner/change-requests/route";
import type { TCreatePlatformPartnerDocumentInput, TCreatePlatformPartnerDocumentOutput } from "@/app/api/platform-partner/documents/route";
import type { TUpdatePlatformPartnerMeInput, TUpdatePlatformPartnerMeOutput } from "@/app/api/platform-partner/me/route";
import type { TCreatePlatformPartnerOnboardingInput, TCreatePlatformPartnerOnboardingOutput } from "@/app/api/platform-partner/onboarding/route";
import type { TTrackPlatformPartnerInput, TTrackPlatformPartnerOutput } from "@/app/api/platform-partners/track/route";
import axios from "axios";

export async function trackPlatformPartner(input: TTrackPlatformPartnerInput) {
	const { data } = await axios.post<TTrackPlatformPartnerOutput>("/api/platform-partners/track", input);
	return data;
}

export async function createPlatformPartnerOnboarding(input: TCreatePlatformPartnerOnboardingInput) {
	const { data } = await axios.post<TCreatePlatformPartnerOnboardingOutput>("/api/platform-partner/onboarding", input);
	return data;
}

export async function updatePlatformPartnerMe(input: TUpdatePlatformPartnerMeInput) {
	const { data } = await axios.put<TUpdatePlatformPartnerMeOutput>("/api/platform-partner/me", input);
	return data;
}

export async function createPlatformPartnerDocument(input: TCreatePlatformPartnerDocumentInput) {
	const formData = new FormData();
	formData.set("tipo", input.tipo);
	formData.set("file", input.file);
	const { data } = await axios.post<TCreatePlatformPartnerDocumentOutput>("/api/platform-partner/documents", formData);
	return data;
}

export async function createAdminPlatformPartner(input: TCreateAdminPlatformPartnerInput) {
	const { data } = await axios.post<TCreateAdminPlatformPartnerOutput>("/api/admin/platform-partners", input);
	return data;
}

export async function updateAdminPlatformPartner(input: TUpdateAdminPlatformPartnerInput) {
	const { data } = await axios.put<TUpdateAdminPlatformPartnerOutput>("/api/admin/platform-partners", input);
	return data;
}

export async function updateAdminPlatformPartnerCommission(input: TUpdateAdminPlatformPartnerCommissionInput) {
	const { data } = await axios.put<TUpdateAdminPlatformPartnerCommissionOutput>("/api/admin/platform-partners/commissions", input);
	return data;
}

export async function createAdminPlatformPartnerPayout(input: TCreateAdminPlatformPartnerPayoutInput) {
	const { data } = await axios.post<TCreateAdminPlatformPartnerPayoutOutput>("/api/admin/platform-partners/payouts", input);
	return data;
}

export async function updateAdminPlatformPartnerPayout(input: TUpdateAdminPlatformPartnerPayoutInput) {
	const { data } = await axios.put<TUpdateAdminPlatformPartnerPayoutOutput>("/api/admin/platform-partners/payouts", input);
	return data;
}

export async function createAdminPlatformPartnerPayoutReceipt(input: TCreateAdminPlatformPartnerPayoutReceiptInput) {
	const formData = new FormData();
	formData.set("payoutId", input.payoutId);
	formData.set("file", input.file);
	const { data } = await axios.post<TCreateAdminPlatformPartnerPayoutReceiptOutput>("/api/admin/platform-partners/payouts/receipt", formData);
	return data;
}

export async function createPlatformPartnerChangeRequest(input: TCreatePlatformPartnerChangeRequestInput) {
	const { data } = await axios.post<TCreatePlatformPartnerChangeRequestOutput>("/api/platform-partner/change-requests", input);
	return data;
}

export async function deletePlatformPartnerChangeRequest() {
	const { data } = await axios.delete<TDeletePlatformPartnerChangeRequestOutput>("/api/platform-partner/change-requests");
	return data;
}

export async function resolveAdminPlatformPartnerChangeRequest(input: TResolveAdminPlatformPartnerChangeRequestInput) {
	const { data } = await axios.put<TResolveAdminPlatformPartnerChangeRequestOutput>("/api/admin/platform-partners/change-requests", input);
	return data;
}

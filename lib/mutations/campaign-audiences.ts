import type {
	TCreateCampaignAudienceInput,
	TCreateCampaignAudienceOutput,
	TDeleteCampaignAudienceOutput,
	TUpdateCampaignAudienceInput,
	TUpdateCampaignAudienceOutput,
} from "@/app/api/campaign-audiences/route";
import type { TPreviewCampaignAudienceInput, TPreviewCampaignAudienceOutput } from "@/app/api/campaign-audiences/preview/route";
import axios from "axios";

export async function createCampaignAudience(input: TCreateCampaignAudienceInput) {
	try {
		const { data } = await axios.post<TCreateCampaignAudienceOutput>("/api/campaign-audiences", input);
		return data;
	} catch (error) {
		console.log("Error running createCampaignAudience", error);
		throw error;
	}
}

export async function updateCampaignAudience(input: TUpdateCampaignAudienceInput) {
	try {
		const { data } = await axios.put<TUpdateCampaignAudienceOutput>("/api/campaign-audiences", input);
		return data;
	} catch (error) {
		console.log("Error running updateCampaignAudience", error);
		throw error;
	}
}

export async function deleteCampaignAudience(id: string) {
	try {
		const { data } = await axios.delete<TDeleteCampaignAudienceOutput>(`/api/campaign-audiences?id=${id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteCampaignAudience", error);
		throw error;
	}
}

export async function previewCampaignAudience(input: TPreviewCampaignAudienceInput) {
	try {
		const { data } = await axios.post<TPreviewCampaignAudienceOutput>("/api/campaign-audiences/preview", input);
		return data;
	} catch (error) {
		console.log("Error running previewCampaignAudience", error);
		throw error;
	}
}

import type { TRetryCampaignInteractionInput, TRetryCampaignInteractionOutput } from "@/app/api/campaigns/interactions/route";
import type { TCreateCampaignInput, TCreateCampaignOutput, TUpdateCampaignInput, TUpdateCampaignOutput } from "@/app/api/campaigns/route";
import axios from "axios";

export async function createCampaign(input: TCreateCampaignInput) {
	try {
		const { data } = await axios.post<TCreateCampaignOutput>("/api/campaigns", input);
		return data;
	} catch (error) {
		console.log("Error running createCampaign", error);
		throw error;
	}
}

export async function updateCampaign(input: TUpdateCampaignInput) {
	try {
		const { data } = await axios.put<TUpdateCampaignOutput>("/api/campaigns", input);
		return data;
	} catch (error) {
		console.log("Error running updateCampaign", error);
		throw error;
	}
}

export async function retryCampaignInteraction(input: TRetryCampaignInteractionInput) {
	try {
		const { data } = await axios.post<TRetryCampaignInteractionOutput>("/api/campaigns/interactions", input);
		return data;
	} catch (error) {
		console.log("Error running retryCampaignInteraction", error);
		throw error;
	}
}

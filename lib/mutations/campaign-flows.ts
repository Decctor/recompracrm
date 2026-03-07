import type {
	TCreateCampaignFlowInput,
	TCreateCampaignFlowOutput,
	TDeleteCampaignFlowOutput,
	TUpdateCampaignFlowInput,
	TUpdateCampaignFlowOutput,
} from "@/app/api/campaign-flows/route";
import type { TExecuteCampaignFlowInput, TExecuteCampaignFlowOutput } from "@/app/api/campaign-flows/execute/route";
import axios from "axios";

export async function createCampaignFlow(input: TCreateCampaignFlowInput) {
	try {
		const { data } = await axios.post<TCreateCampaignFlowOutput>("/api/campaign-flows", input);
		return data;
	} catch (error) {
		console.log("Error running createCampaignFlow", error);
		throw error;
	}
}

export async function updateCampaignFlow(input: TUpdateCampaignFlowInput) {
	try {
		const { data } = await axios.put<TUpdateCampaignFlowOutput>("/api/campaign-flows", input);
		return data;
	} catch (error) {
		console.log("Error running updateCampaignFlow", error);
		throw error;
	}
}

export async function deleteCampaignFlow(id: string) {
	try {
		const { data } = await axios.delete<TDeleteCampaignFlowOutput>(`/api/campaign-flows?id=${id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteCampaignFlow", error);
		throw error;
	}
}

export async function executeCampaignFlow(input: TExecuteCampaignFlowInput) {
	try {
		const { data } = await axios.post<TExecuteCampaignFlowOutput>("/api/campaign-flows/execute", input);
		return data;
	} catch (error) {
		console.log("Error running executeCampaignFlow", error);
		throw error;
	}
}

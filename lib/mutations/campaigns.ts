import type { TRetryCampaignDispatchInput, TRetryCampaignDispatchOutput } from "@/app/api/campaigns/dispatches/route";
import type { TRetryCampaignInteractionInput, TRetryCampaignInteractionOutput } from "@/app/api/campaigns/interactions/route";
import type { TCreateCampaignInput, TCreateCampaignOutput, TUpdateCampaignInput, TUpdateCampaignOutput } from "@/app/api/campaigns/route";
import type { TTestCampaignInput, TTestCampaignOutput } from "@/app/api/campaigns/test/route";
import type { TCampaignInlineCouponInput } from "@/schemas/coupons";
import axios from "axios";

/** `couponToCreate` é opcional: só o construtor, no modo "criar cupom para esta campanha", envia. */
export async function createCampaign(input: TCreateCampaignInput & { couponToCreate?: TCampaignInlineCouponInput | null }) {
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

export async function testCampaign(input: TTestCampaignInput) {
	try {
		const { data } = await axios.post<TTestCampaignOutput>("/api/campaigns/test", input);
		return data;
	} catch (error) {
		console.log("Error running testCampaign", error);
		throw error;
	}
}

export async function retryCampaignDispatch(input: TRetryCampaignDispatchInput) {
	try {
		const { data } = await axios.post<TRetryCampaignDispatchOutput>("/api/campaigns/dispatches", input);
		return data;
	} catch (error) {
		console.log("Error running retryCampaignDispatch", error);
		throw error;
	}
}

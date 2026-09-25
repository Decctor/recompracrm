import { campaignAudienceHasClient, resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import type { TCampaignWithAudienceRelations, TDataCollectingV2Executor } from "./types";

export async function resolveCampaignAudiences({
	tx,
	organizationId,
	campaigns,
	concurrency = 5,
	restrictToClientIds,
}: {
	tx: TDataCollectingV2Executor;
	organizationId: string;
	campaigns: TCampaignWithAudienceRelations[];
	concurrency?: number;
	// Clientes do lote: só o pertencimento deles é consultado pelos gatilhos de venda.
	restrictToClientIds: string[];
}) {
	return resolveCampaignAudiencesByCampaignId({
		executor: tx,
		organizationId,
		campaigns,
		concurrency,
		restrictToClientIds,
	});
}

export { campaignAudienceHasClient };

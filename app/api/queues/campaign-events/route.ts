import { handleCallback } from "@vercel/queue";
import { CampaignEventMessageSchema, resolveCampaignEventMessageIds } from "@/lib/campaigns/events/queue";
import { processCampaignEventBatch } from "@/lib/campaigns/events/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uma mensagem leva até 25 eventos processados em sequência.
export const maxDuration = 300;

export const POST = handleCallback(
	async (message) => {
		await processCampaignEventBatch({ eventIds: resolveCampaignEventMessageIds(CampaignEventMessageSchema.parse(message)) });
	},
	{ retry: (_error, metadata) => (metadata.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 60 }) },
);

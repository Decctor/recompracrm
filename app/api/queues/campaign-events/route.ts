import { handleCallback } from "@vercel/queue";
import { CampaignEventMessageSchema } from "@/lib/campaigns/events/queue";
import { processCampaignEvent } from "@/lib/campaigns/events/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = handleCallback(
	async (message) => {
		const { eventId } = CampaignEventMessageSchema.parse(message);
		await processCampaignEvent({ eventId });
	},
	{ retry: (_error, metadata) => (metadata.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 60 }) },
);

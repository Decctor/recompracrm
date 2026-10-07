import { send } from "@vercel/queue";
import { z } from "zod";
import { db, type DBTransaction } from "@/services/drizzle";
import { campaignEvents } from "@/services/drizzle/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import { CAMPAIGN_EVENTS_TOPIC, isCampaignEventCaptureEnabled } from "./policy";

export const CampaignEventMessageSchema = z.object({
	eventId: z.string({ required_error: "Evento não informado.", invalid_type_error: "Evento inválido." }).min(1),
});

const PUBLISH_CONCURRENCY = 10;
const REPUBLISH_DELAY_MS = 60_000;

/**
 * Best-effort queue delivery; pending rows remain the source of truth for the cron.
 *
 * Pages through every due row (a producer may capture thousands of events in one transaction,
 * e.g. the RFM analysis) instead of stopping at one page. Each publish pushes `proximaTentativa`
 * forward, so published rows leave the `<= now` window and the loop terminates on its own;
 * `maxEvents` bounds a single call anyway.
 *
 * The idempotency key is derived from the row's current `proximaTentativa`: two publishers that
 * read the same row state (producer and cron on either side of a minute boundary) deduplicate in
 * the queue, while a republish after a bump is a genuinely new delivery.
 */
export async function publishPendingCampaignEvents({
	organizationId,
	sourceType,
	sourceId,
	now = new Date(),
	limit = 100,
	maxEvents = 5000,
	executor = db,
	enabled = isCampaignEventCaptureEnabled(organizationId),
	publish = async (eventId: string, generation: number) => {
		await send(CAMPAIGN_EVENTS_TOPIC, { eventId }, { idempotencyKey: `campaign-event-${eventId}-${generation}` });
	},
}: {
	organizationId?: string;
	sourceType?: string;
	sourceId?: string;
	now?: Date;
	limit?: number;
	maxEvents?: number;
	executor?: typeof db | DBTransaction;
	enabled?: boolean;
	publish?: (eventId: string, generation: number) => Promise<void>;
} = {}) {
	if (!enabled) return { published: 0, failed: 0 };
	const summary = { published: 0, failed: 0 };
	const retryAt = new Date(now.getTime() + REPUBLISH_DELAY_MS);
	while (summary.published + summary.failed < maxEvents) {
		const pending = await executor
			.select({ id: campaignEvents.id, proximaTentativa: campaignEvents.proximaTentativa })
			.from(campaignEvents)
			.where(
				and(
					eq(campaignEvents.status, "PENDENTE"),
					eq(campaignEvents.publicacaoPermitida, true),
					lte(campaignEvents.proximaTentativa, now),
					organizationId ? eq(campaignEvents.organizacaoId, organizationId) : undefined,
					sourceType ? eq(campaignEvents.fonteTipo, sourceType) : undefined,
					sourceId ? eq(campaignEvents.fonteId, sourceId) : undefined,
				),
			)
			.orderBy(asc(campaignEvents.proximaTentativa), asc(campaignEvents.sequencia))
			.limit(Math.min(limit, maxEvents - summary.published - summary.failed));
		if (pending.length === 0) break;
		for (let index = 0; index < pending.length; index += PUBLISH_CONCURRENCY) {
			await Promise.all(
				pending.slice(index, index + PUBLISH_CONCURRENCY).map(async (event) => {
					try {
						await publish(event.id, event.proximaTentativa.getTime());
						await executor
							.update(campaignEvents)
							.set({ proximaTentativa: retryAt })
							.where(and(eq(campaignEvents.id, event.id), eq(campaignEvents.status, "PENDENTE")));
						summary.published += 1;
					} catch (error) {
						await executor
							.update(campaignEvents)
							.set({ erro: String(error).slice(0, 2000), proximaTentativa: retryAt })
							.where(and(eq(campaignEvents.id, event.id), eq(campaignEvents.status, "PENDENTE")));
						summary.failed += 1;
						console.error("[CAMPAIGN_EVENTS] Publicação falhou; evento permanece pendente.", event.id, error);
					}
				}),
			);
		}
		if (pending.length < limit) break;
	}
	return summary;
}

export async function publishPendingCampaignEventsSafely(input: Parameters<typeof publishPendingCampaignEvents>[0] = {}) {
	try {
		return await publishPendingCampaignEvents(input);
	} catch (error) {
		console.error("[CAMPAIGN_EVENTS] Falha ao publicar; o cron recuperará os eventos pendentes.", error);
		return { published: 0, failed: 0 };
	}
}

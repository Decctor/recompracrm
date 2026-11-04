import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import { z } from "zod";
import { db, type DBTransaction } from "@/services/drizzle";
import { campaignEvents } from "@/services/drizzle/schema";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { CAMPAIGN_EVENTS_TOPIC, isCampaignEventCaptureEnabled } from "./policy";

// Uma mensagem leva um evento (`eventId`, mensagens já na fila antes do lote) ou um lote
// (`eventIds`). Uma mensagem por evento virava uma instância por evento: a fila não limita a
// concorrência dos consumers, e uma análise RFM captura um evento por cliente de uma vez.
export const CampaignEventMessageSchema = z
	.object({
		eventId: z.string({ invalid_type_error: "Evento inválido." }).min(1).optional(),
		eventIds: z
			.array(z.string({ invalid_type_error: "Evento inválido." }).min(1), { invalid_type_error: "Tipo inválido para os eventos." })
			.min(1)
			.max(50)
			.optional(),
	})
	.refine((message) => !!message.eventId || !!message.eventIds?.length, { message: "Evento não informado." });
export type TCampaignEventMessage = z.infer<typeof CampaignEventMessageSchema>;

/** Eventos de uma mensagem, na ordem publicada (a ordem do cliente importa) e sem repetição. */
export function resolveCampaignEventMessageIds(message: TCampaignEventMessage) {
	return Array.from(new Set([...(message.eventId ? [message.eventId] : []), ...(message.eventIds ?? [])]));
}

// Eventos por mensagem: processados em sequência pela mesma instância.
export const CAMPAIGN_EVENTS_PER_MESSAGE = 25;
// Mensagens por segundo numa rajada (cada uma com até 25 eventos): 5.000 eventos = 200 mensagens
// espalhadas em ~100s, em vez de 5.000 instâncias ao mesmo tempo.
const MESSAGES_PER_SECOND = 2;
// Publicações simultâneas (HTTP para a fila, sem trabalho no banco além do bump da linha).
const PUBLISH_CONCURRENCY = 5;
const REPUBLISH_DELAY_MS = 60_000;

export type TCampaignEventPublication = { id: string; generation: number };
export type TPublishCampaignEventBatch = (events: TCampaignEventPublication[], options: { delaySeconds: number }) => Promise<void>;

const publishCampaignEventBatchToQueue: TPublishCampaignEventBatch = async (events, { delaySeconds }) => {
	// Mesmo conjunto no mesmo estado (produtor e cron de cada lado de uma virada de minuto) gera a
	// mesma chave e é deduplicado na fila; um republish após o bump é uma entrega nova.
	const digest = createHash("sha1")
		.update(events.map((event) => `${event.id}:${event.generation}`).join(","))
		.digest("hex")
		.slice(0, 24);
	await send(CAMPAIGN_EVENTS_TOPIC, { eventIds: events.map((event) => event.id) } satisfies TCampaignEventMessage, {
		idempotencyKey: `campaign-events-${digest}`,
		...(delaySeconds ? { delaySeconds } : {}),
	});
};

/**
 * Best-effort queue delivery; pending rows remain the source of truth for the cron.
 *
 * Pages through every due row (a producer may capture thousands of events in one transaction,
 * e.g. the RFM analysis) instead of stopping at one page, and publishes them in batches of
 * CAMPAIGN_EVENTS_PER_MESSAGE, spaced at MESSAGES_PER_SECOND across the whole call. Each publish
 * pushes `proximaTentativa` past the message's delay plus the republish window, so published rows
 * leave the `<= now` window (the loop terminates on its own) and are not republished while their
 * message is still waiting in the queue; `maxEvents` bounds a single call anyway.
 *
 * The idempotency key is derived from the rows' current `proximaTentativa`: two publishers that
 * read the same row state deduplicate in the queue, while a republish after a bump is a genuinely
 * new delivery.
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
	publish = publishCampaignEventBatchToQueue,
}: {
	organizationId?: string;
	sourceType?: string;
	sourceId?: string;
	now?: Date;
	limit?: number;
	maxEvents?: number;
	executor?: typeof db | DBTransaction;
	enabled?: boolean;
	publish?: TPublishCampaignEventBatch;
} = {}) {
	if (!enabled) return { published: 0, failed: 0, messages: 0 };
	const summary = { published: 0, failed: 0, messages: 0 };
	let messageIndex = 0;
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

		const batches: { events: TCampaignEventPublication[]; delaySeconds: number }[] = [];
		for (let index = 0; index < pending.length; index += CAMPAIGN_EVENTS_PER_MESSAGE) {
			batches.push({
				events: pending
					.slice(index, index + CAMPAIGN_EVENTS_PER_MESSAGE)
					.map((event) => ({ id: event.id, generation: event.proximaTentativa.getTime() })),
				delaySeconds: Math.floor(messageIndex / MESSAGES_PER_SECOND),
			});
			messageIndex += 1;
		}

		for (let index = 0; index < batches.length; index += PUBLISH_CONCURRENCY) {
			await Promise.all(
				batches.slice(index, index + PUBLISH_CONCURRENCY).map(async ({ events, delaySeconds }) => {
					const ids = events.map((event) => event.id);
					try {
						await publish(events, { delaySeconds });
						await executor
							.update(campaignEvents)
							.set({ proximaTentativa: new Date(now.getTime() + delaySeconds * 1000 + REPUBLISH_DELAY_MS) })
							.where(and(inArray(campaignEvents.id, ids), eq(campaignEvents.status, "PENDENTE")));
						summary.published += events.length;
						summary.messages += 1;
					} catch (error) {
						await executor
							.update(campaignEvents)
							.set({ erro: String(error).slice(0, 2000), proximaTentativa: new Date(now.getTime() + REPUBLISH_DELAY_MS) })
							.where(and(inArray(campaignEvents.id, ids), eq(campaignEvents.status, "PENDENTE")));
						summary.failed += events.length;
						console.error("[CAMPAIGN_EVENTS] Publicação falhou; eventos permanecem pendentes.", ids, error);
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
		return { published: 0, failed: 0, messages: 0 };
	}
}

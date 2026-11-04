import { db, type DBTransaction } from "@/services/drizzle";
import { campaignEvents } from "@/services/drizzle/schema";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { publishEventDispatches } from "@/lib/campaigns/engine";
import { resolveCampaignEventHandler } from "./registry";
import { publishCampaignDispatchExpand, resolveClockPublishDelaySeconds } from "@/lib/campaigns/dispatch/queue";
import { CAMPAIGN_EVENT_MAX_AGE_MS, CAMPAIGN_EVENT_MAX_ATTEMPTS } from "./policy";
import type { TCampaignEventDispatch } from "./types";

/**
 * Handler effects and event completion share one transaction; retries never see partial work.
 * An event is discarded (never retried, never a backfill) when it is older than the max age or
 * when it keeps throwing past the attempt cap; a discarded or stale event never holds back the
 * customer's newer events.
 */
export async function processCampaignEventInTransaction({
	tx,
	eventId,
	now = new Date(),
	resolveHandler = resolveCampaignEventHandler,
}: {
	tx: DBTransaction;
	eventId: string;
	now?: Date;
	resolveHandler?: typeof resolveCampaignEventHandler;
}): Promise<TCampaignEventDispatch[]> {
	const [event] = await tx
		.select()
		.from(campaignEvents)
		.where(and(eq(campaignEvents.id, eventId), eq(campaignEvents.status, "PENDENTE")))
		.for("update", { skipLocked: true });
	if (!event) return [];
	if (!event.publicacaoPermitida) return [];
	const discard = async (reason: string) => {
		await tx.update(campaignEvents).set({ status: "DESCARTADA", erro: reason, dataProcessamento: now }).where(eq(campaignEvents.id, event.id));
		return [];
	};
	if (now.getTime() - event.dataEvento.getTime() > CAMPAIGN_EVENT_MAX_AGE_MS) return discard("Evento expirado; envio retroativo descartado.");
	if (event.tentativas >= CAMPAIGN_EVENT_MAX_ATTEMPTS)
		return discard(`Tentativas esgotadas (${event.tentativas}). Último erro: ${event.erro ?? "desconhecido"}`);
	const scope = event.clienteId ?? `campanha:${event.fonteId}`;
	await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${event.organizacaoId}:${scope}:campaign-events`}, 0))`);
	if (event.clienteId) {
		const earlier = await tx.query.campaignEvents.findFirst({
			where: and(
				eq(campaignEvents.organizacaoId, event.organizacaoId),
				eq(campaignEvents.clienteId, event.clienteId),
				eq(campaignEvents.status, "PENDENTE"),
				eq(campaignEvents.publicacaoPermitida, true),
				lt(campaignEvents.sequencia, event.sequencia),
				// A stale earlier event will be discarded on its own delivery; it must not block this one.
				gt(campaignEvents.dataEvento, new Date(now.getTime() - CAMPAIGN_EVENT_MAX_AGE_MS)),
				lt(campaignEvents.tentativas, CAMPAIGN_EVENT_MAX_ATTEMPTS),
			),
			columns: { id: true },
		});
		if (earlier) throw new Error(`Evento anterior pendente: ${earlier.id}.`);
	}
	const result = await resolveHandler(event).process({ tx, event, payload: event.contexto, now });
	await tx
		.update(campaignEvents)
		.set({
			status: result.discardReason ? "DESCARTADA" : "PROCESSADA",
			erro: result.discardReason ?? null,
			dataProcessamento: now,
		})
		.where(eq(campaignEvents.id, event.id));
	return result.dispatches;
}

/** Processa um evento e devolve os disparos criados, sem publicá-los. Falha registra a tentativa e relança. */
async function processCampaignEventCollectingDispatches(eventId: string): Promise<TCampaignEventDispatch[]> {
	try {
		return await db.transaction((tx) => processCampaignEventInTransaction({ tx, eventId }));
	} catch (error) {
		await db
			.update(campaignEvents)
			.set({
				erro: String(error).slice(0, 2000),
				tentativas: sql`${campaignEvents.tentativas} + 1`,
				proximaTentativa: new Date(Date.now() + 60_000),
			})
			.where(and(eq(campaignEvents.id, eventId), eq(campaignEvents.status, "PENDENTE")));
		throw error;
	}
}

/**
 * Publica os disparos criados por um lote de eventos depois do commit: os envios imediatos em
 * mensagens de lote, as expansões (campanhas agendadas) espaçadas. Nunca lança — cada falha de
 * publicação deixa o disparo para a varredura de parados do relógio.
 */
export async function publishCampaignEventDispatches(dispatches: TCampaignEventDispatch[]) {
	const expansions = dispatches.filter((dispatch) => dispatch.created && dispatch.expand);
	await Promise.all([
		publishEventDispatches(dispatches.filter((dispatch) => !dispatch.expand)),
		...expansions.map((dispatch, index) =>
			publishCampaignDispatchExpand({ dispatchId: dispatch.dispatchId, delaySeconds: resolveClockPublishDelaySeconds(index) }).catch((error) =>
				console.error("[CAMPAIGN_EVENTS] Falha ao publicar expansão.", error),
			),
		),
	]);
}

/**
 * Consumer de uma mensagem de eventos. Em sequência, na ordem publicada (a do cliente), numa única
 * instância. Uma falha não interrompe os demais: os disparos dos eventos bem-sucedidos são
 * publicados e só então a falha sobe, para a fila reentregar — os eventos já processados não estão
 * mais PENDENTE e recuam na hora.
 */
export async function processCampaignEventBatch({ eventIds }: { eventIds: string[] }) {
	const dispatches: TCampaignEventDispatch[] = [];
	const failed: { eventId: string; error: unknown }[] = [];
	for (const eventId of eventIds) {
		try {
			dispatches.push(...(await processCampaignEventCollectingDispatches(eventId)));
		} catch (error) {
			failed.push({ eventId, error });
		}
	}
	await publishCampaignEventDispatches(dispatches);
	if (failed.length > 0) {
		throw new Error(`Falha em ${failed.length} evento(s) do lote: ${failed.map((failure) => failure.eventId).join(", ")}.`, {
			cause: failed[0]?.error,
		});
	}
	return { processed: eventIds.length - failed.length, dispatches: dispatches.length };
}

export async function processCampaignEvent({ eventId }: { eventId: string }) {
	return processCampaignEventBatch({ eventIds: [eventId] });
}

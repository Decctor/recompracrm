import { db, type DBTransaction } from "@/services/drizzle";
import { campaignEvents } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { resolveCampaignEventHandler } from "./registry";
import type { TCampaignEventHandler, TCampaignEventRecipient, TCampaignEventRecipientBlock, TCampaignEventRecipientClient } from "./types";

type TLoadedEvent = { event: typeof campaignEvents.$inferSelect; handler: TCampaignEventHandler; memo: Map<string, unknown> } | { invalid: string };

/**
 * Dispatches delegate source validity and freshness to their originating event handler.
 *
 * One guard per send batch: the event row (whose payload embeds every recipient of a
 * campaign-wide occurrence) is loaded and parsed once and shared by all its recipients, and the
 * handlers memoize per-event lookups. Loading it per recipient made sending quadratic.
 */
export function createCampaignEventSendGuard({ executor = db, now = new Date() }: { executor?: typeof db | DBTransaction; now?: Date } = {}) {
	const loaded = new Map<string, Promise<TLoadedEvent>>();

	const load = (organizationId: string, eventId: string) => {
		const key = `${organizationId}:${eventId}`;
		let entry = loaded.get(key);
		if (!entry) {
			entry = (async (): Promise<TLoadedEvent> => {
				const event = await executor.query.campaignEvents.findFirst({
					where: and(eq(campaignEvents.id, eventId), eq(campaignEvents.organizacaoId, organizationId)),
				});
				if (!event || !event.publicacaoPermitida || event.status !== "PROCESSADA")
					return { invalid: "Evento ausente ou incompatível com o destinatário." };
				try {
					const handler = resolveCampaignEventHandler(event);
					handler.parse(event.contexto);
					return { event, handler, memo: new Map() };
				} catch {
					return { invalid: "Tipo, versão ou contexto do evento inválido." };
				}
			})();
			loaded.set(key, entry);
		}
		return entry;
	};

	return {
		async getRecipientBlock({
			recipient,
			client,
			scheduledAt,
		}: {
			recipient: TCampaignEventRecipient;
			client?: TCampaignEventRecipientClient | null;
			scheduledAt: Date | null;
		}): Promise<TCampaignEventRecipientBlock | null> {
			if (!recipient.campanhaEventoId) return null;
			const entry = await load(recipient.organizacaoId, recipient.campanhaEventoId);
			if ("invalid" in entry) return { motivo: "EVENTO_INVALIDO", erro: entry.invalid };
			if (entry.event.clienteId && entry.event.clienteId !== recipient.clienteId) {
				return { motivo: "EVENTO_INVALIDO", erro: "Evento ausente ou incompatível com o destinatário." };
			}
			return entry.handler.validateRecipient({
				executor,
				event: entry.event,
				payload: entry.event.contexto,
				recipient,
				client,
				scheduledAt,
				now,
				memo: entry.memo,
			});
		},
	};
}

/** Single-recipient convenience over the per-batch guard. */
export async function getCampaignEventRecipientBlock({
	executor = db,
	recipient,
	client,
	scheduledAt,
	now = new Date(),
}: {
	executor?: typeof db | DBTransaction;
	recipient: TCampaignEventRecipient;
	client?: TCampaignEventRecipientClient | null;
	scheduledAt: Date | null;
	now?: Date;
}): Promise<TCampaignEventRecipientBlock | null> {
	return createCampaignEventSendGuard({ executor, now }).getRecipientBlock({ recipient, client, scheduledAt });
}

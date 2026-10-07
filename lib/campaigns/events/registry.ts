import { saleCampaignEventHandler } from "./handlers/sale";
import { campaignOccurrenceHandler, scheduledCampaignHandler } from "./handlers/occurrence";
import type { TCampaignEventType } from "@/schemas/campaign-events";
import type { TCampaignEventHandler } from "./types";

/**
 * Erase payload types only after binding each handler's runtime parser. The parse result is
 * memoized per payload object: the send guard validates every recipient of a dispatch against
 * the same loaded event, so a campaign-wide payload is parsed once, not once per recipient.
 */
function bindHandler<T>(handler: TCampaignEventHandler<T>): TCampaignEventHandler {
	const parsed = new WeakMap<object, T>();
	const parseOnce = (payload: unknown): T => {
		if (payload === null || typeof payload !== "object") return handler.parse(payload);
		const cached = parsed.get(payload);
		if (cached !== undefined) return cached;
		const result = handler.parse(payload);
		parsed.set(payload, result);
		return result;
	};
	return {
		parse: parseOnce,
		process: (context) => handler.process({ ...context, payload: parseOnce(context.payload) }),
		validateRecipient: (context) => handler.validateRecipient({ ...context, payload: parseOnce(context.payload) }),
	};
}

const handlers = {
	COMPRA_CONFIRMADA: { 1: bindHandler(saleCampaignEventHandler) },
	CASHBACK_ACUMULADO: { 1: bindHandler(saleCampaignEventHandler) },
	ENTRADA_SEGMENTACAO: { 1: bindHandler(campaignOccurrenceHandler) },
	PERMANENCIA_SEGMENTACAO: { 1: bindHandler(campaignOccurrenceHandler) },
	ANIVERSARIO_CLIENTE: { 1: bindHandler(campaignOccurrenceHandler) },
	CASHBACK_EXPIRANDO: { 1: bindHandler(campaignOccurrenceHandler) },
	PIOR_DIA_VENDAS: { 1: bindHandler(campaignOccurrenceHandler) },
	CAMPANHA_SOLICITADA: { 1: bindHandler(campaignOccurrenceHandler) },
	CAMPANHA_AGENDADA: { 1: bindHandler(scheduledCampaignHandler) },
} satisfies Record<TCampaignEventType, Record<number, TCampaignEventHandler>>;

export function resolveCampaignEventHandler(event: { tipo: string; versao: number }): TCampaignEventHandler {
	const versions = Object.hasOwn(handlers, event.tipo) ? handlers[event.tipo as TCampaignEventType] : undefined;
	const handler = versions && Object.hasOwn(versions, event.versao) ? (versions as Record<number, TCampaignEventHandler>)[event.versao] : undefined;
	if (!handler) throw new Error(`Evento de campanha sem handler: ${event.tipo} v${event.versao}.`);
	return handler;
}

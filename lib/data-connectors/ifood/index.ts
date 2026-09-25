import type { TCanonicalImportWindow } from "../types";
import { createIfoodClient, getIfoodOrder, getValidIfoodConfig, acknowledgeIfoodEvents, pollIfoodEvents } from "./client";
import { appendIfoodHomologationAudit } from "./homologation-audit";
import { toCanonicalIfoodImportBatch } from "./mappers";
import { IfoodConfigSchema, type TIfoodEvent } from "./types";

// Inclui as etapas intermediarias do ciclo (preparo/pronto/despacho) para que acoes feitas em
// outros devices (ex.: Gestor de Pedidos) movam o quadro de atendimento via ingestao.
const IFOOD_RELEVANT_ORDER_EVENT_CODES = new Set([
	"PLC",
	"CFM",
	"PRS",
	"SPS",
	"SPE",
	"RTP",
	"DSP",
	"COL",
	"CON",
	"CAN",
	"CAR",
	"PLACED",
	"CONFIRMED",
	"PREPARATION_STARTED",
	"SEPARATION_STARTED",
	"SEPARATION_ENDED",
	"READY_TO_PICKUP",
	"DISPATCHED",
	"COLLECTED",
	"CONCLUDED",
	"CANCELLED",
	"CANCELED",
	// Cancelamento SOLICITADO (ainda nao efetivado): informativo, emitido logo apos o
	// requestCancellation da propria loja — nao exige resposta (o desfecho chega como CANCELLED ou
	// CANCELLATION_REQUEST_FAILED). Entra na ingestao para a venda registrar a pendencia.
	"CANCELLATION_REQUESTED",
	// Solicitacao REJEITADA: sem ela na lista a pendencia acima nunca seria encerrada quando o
	// iFood nega o cancelamento e o pedido segue vivo.
	"CARF",
	"CANCELLATION_REQUEST_FAILED",
	// Plataforma de Negociacao: disputa aberta pelo cliente/iFood — EXIGE resposta da loja antes
	// do prazo (accept/reject/alternative na API de disputes), senao o iFood executa a acao de
	// timeout. O settlement entra para disparar o remapeamento que encerra a pendencia.
	"HSD",
	"HANDSHAKE_DISPUTE",
	"HSS",
	"HANDSHAKE_SETTLEMENT",
]);

function getRelevantOrderEvents(events: TIfoodEvent[]) {
	return events.filter((event) => {
		if (!event.orderId) return false;
		const eventCode = event.code.toUpperCase();
		const eventFullCode = event.fullCode?.toUpperCase();
		return IFOOD_RELEVANT_ORDER_EVENT_CODES.has(eventCode) || (eventFullCode ? IFOOD_RELEVANT_ORDER_EVENT_CODES.has(eventFullCode) : false);
	});
}

/**
 * Orçamento de rede do polling. O ciclo roda a cada 30s numa função com `maxDuration` de 25s: uma
 * chamada pendurada nos 30s padrão (ou uma pausa de `Retry-After` de 30s) consumiria a invocação
 * inteira para depois ser abortada — e o ciclo seguinte repetiria a chamada de qualquer forma.
 * Pior caso por integração: 8s + 2s de espera + 8s = 18s, dentro do limite da função.
 */
const IFOOD_POLLING_CLIENT_OPTIONS = {
	timeoutMs: 8_000,
	retry: { maxRetries: 1, maxDelayMs: 2_000 },
} as const;

function uniqueOrderIds(events: TIfoodEvent[]) {
	return Array.from(new Set(events.map((event) => event.orderId).filter((orderId): orderId is string => !!orderId)));
}

export async function fetchIfoodImportBatch({
	organizationId,
	integrationId,
	config,
	window,
}: {
	organizationId: string;
	integrationId: string;
	config: unknown;
	window: TCanonicalImportWindow;
}) {
	const parsedConfig = IfoodConfigSchema.parse(config);
	const validConfig = await getValidIfoodConfig({ integrationId, config: parsedConfig });
	const client = createIfoodClient(validConfig, IFOOD_POLLING_CLIENT_OPTIONS);
	const events = await pollIfoodEvents(client, { merchantIds: validConfig.merchantIds });
	const relevantEvents = getRelevantOrderEvents(events);
	// Sem isto o polling fica cego: os codigos crus sao a unica forma de distinguir um cancelamento
	// da loja (CAN) de uma solicitacao do cliente (CAR) ou de uma disputa (HSD) durante a homologacao.
	//
	// O `event.id` vai junto porque e a UNICA chave que o suporte do iFood aceita para cruzar o
	// nosso log com o Firefly Audit deles. Na homologacao de 29/08/2026 logamos so o codigo e o
	// orderId, e quando pediram os IDs nao tinhamos como responder — evento ACKado nao e reentregue.
	if (events.length)
		console.log("[IFOOD_EVENTS]", {
			organizationId,
			received: events.map((event) => `${event.fullCode ?? event.code}${event.orderId ? `:${event.orderId.slice(0, 8)}` : ""} id=${event.id}`),
			ignored: events.filter((event) => !relevantEvents.includes(event)).map((event) => `${event.fullCode ?? event.code} id=${event.id}`),
		});

	await appendIfoodHomologationAudit({
		type: "poll_received",
		organizationId,
		integrationId,
		merchantIds: validConfig.merchantIds,
		events: events.map((event) => ({
			id: event.id,
			code: event.code,
			fullCode: event.fullCode ?? null,
			orderId: event.orderId ?? null,
			merchantId: event.merchantId ?? null,
			createdAt: event.createdAt ?? null,
			relevant: relevantEvents.includes(event),
		})),
	});

	// A homologacao exige ACK imediato de TODOS os eventos retornados, inclusive desconhecidos,
	// opcionais, duplicados e eventos de codigo de entrega. Por isso o ACK usa `events`, nao
	// `relevantEvents`, e acontece antes de buscar pedidos ou abrir a transacao de ingestao.
	const eventIds = events.map((event) => event.id);
	if (eventIds.length) {
		try {
			const statusCodes = await acknowledgeIfoodEvents(client, eventIds);
			console.log("[IFOOD_EVENTS_ACK]", { organizationId, eventIds, statusCodes });
			await appendIfoodHomologationAudit({ type: "ack_succeeded", organizationId, integrationId, eventIds, statusCodes });
		} catch (error) {
			await appendIfoodHomologationAudit({
				type: "ack_failed",
				organizationId,
				integrationId,
				eventIds,
				error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
			});
			throw error;
		}
	}
	const orderIds = uniqueOrderIds(relevantEvents);
	const orders = await Promise.all(orderIds.map((orderId) => getIfoodOrder(client, orderId)));

	return toCanonicalIfoodImportBatch({
		organizationId,
		window,
		orders,
		events,
	});
}

export * from "./client";
export * from "./mappers";
export * from "./homologation-audit";
export * from "./types";

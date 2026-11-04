import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import { z } from "zod";

/**
 * Tópicos do pipeline de campanhas (Vercel Queues). O relógio (cron) e os gatilhos de evento
 * publicam; os consumers em app/api/queues/campaign-dispatch-* processam. O banco
 * (campaign_dispatches + recipients) é a fonte da verdade — a fila é só entrega de trabalho:
 * toda mensagem é idempotente e um consumer reentregue recua sozinho.
 */
export const CAMPAIGN_DISPATCH_EXPAND_TOPIC = "campaign-dispatch-expand";
export const CAMPAIGN_DISPATCH_SEND_TOPIC = "campaign-dispatch-send";

export const CampaignDispatchExpandMessageSchema = z.object({
	dispatchId: z.string({ invalid_type_error: "Tipo inválido para o id do disparo." }).min(1),
});
export type TCampaignDispatchExpandMessage = z.infer<typeof CampaignDispatchExpandMessageSchema>;

// Uma mensagem leva um disparo (`dispatchId`, leque da expansão e retomadas) ou um lote
// (`dispatchIds`): disparos de evento têm um destinatário cada e convergem para o mesmo horário —
// uma mensagem por disparo virava uma instância por cliente (incidente de 04/11/2026).
export const CampaignDispatchSendMessageSchema = z
	.object({
		dispatchId: z.string({ invalid_type_error: "Tipo inválido para o id do disparo." }).min(1).optional(),
		dispatchIds: z
			.array(z.string({ invalid_type_error: "Tipo inválido para o id do disparo." }).min(1), {
				invalid_type_error: "Tipo inválido para os ids dos disparos.",
			})
			.min(1)
			.max(50)
			.optional(),
		// Índice do worker dentro do leque publicado pela expansão; só para logs.
		worker: z.number({ invalid_type_error: "Tipo inválido para o índice do worker." }).int().nonnegative().optional(),
	})
	.refine((message) => !!message.dispatchId || !!message.dispatchIds?.length, { message: "Mensagem de envio sem disparo." });
export type TCampaignDispatchSendMessage = z.infer<typeof CampaignDispatchSendMessageSchema>;

// Publicações por segundo quando o relógio solta muitos disparos de uma vez. A fila não limita a
// concorrência dos consumers: cada mensagem publicada no mesmo instante vira uma instância em
// paralelo, cada uma com seu pool de conexões. Em 04/11/2026 41 disparos de evento agendados para
// 12:00 saíram juntos, ~45 instâncias abriram conexões ao mesmo tempo e o Supavisor recusou
// clientes (limite de 200). Espaçadas, as mensagens caem em instâncias já quentes, uma após a outra.
const CLOCK_PUBLISHES_PER_SECOND = 4;

/** Atraso (s) da `index`-ésima publicação de uma rajada do relógio. */
export function resolveClockPublishDelaySeconds(index: number) {
	return Math.floor(index / CLOCK_PUBLISHES_PER_SECOND);
}

export async function publishCampaignDispatchExpand({
	dispatchId,
	attempt,
	delaySeconds,
}: TCampaignDispatchExpandMessage & { attempt?: string; delaySeconds?: number }) {
	await send(CAMPAIGN_DISPATCH_EXPAND_TOPIC, { dispatchId } satisfies TCampaignDispatchExpandMessage, {
		// Uma expansão por disparo; a varredura de parados passa um `attempt` para republicar.
		idempotencyKey: attempt ? `expand-${dispatchId}-${attempt}` : `expand-${dispatchId}`,
		...(delaySeconds ? { delaySeconds } : {}),
	});
}

/**
 * Publica `workers` mensagens de envio para o disparo. A chave de idempotência inclui uma
 * "geração" (contagem de destinatários aguardando, ou um marcador explícito) para que a
 * continuação de um lote não seja deduplicada contra o leque inicial, mas republicações do mesmo
 * estado sejam.
 */
export async function publishCampaignDispatchSend({
	dispatchId,
	workers = 1,
	generation,
	delaySeconds,
}: {
	dispatchId: string;
	workers?: number;
	generation: string | number;
	delaySeconds?: number;
}) {
	const count = Math.max(1, Math.floor(workers));
	await Promise.all(
		Array.from({ length: count }, (_, worker) =>
			send(CAMPAIGN_DISPATCH_SEND_TOPIC, { dispatchId, worker } satisfies TCampaignDispatchSendMessage, {
				idempotencyKey: `send-${dispatchId}-${generation}-${worker}`,
				...(delaySeconds ? { delaySeconds } : {}),
			}),
		),
	);
}

/** Disparos de uma mensagem de envio, na ordem publicada e sem repetição. */
export function resolveCampaignDispatchSendMessageIds(message: TCampaignDispatchSendMessage) {
	return Array.from(new Set([...(message.dispatchId ? [message.dispatchId] : []), ...(message.dispatchIds ?? [])]));
}

// Disparos por mensagem de lote. Cada um é enviado em sequência pela mesma instância; 25 disparos
// de um destinatário cabem com folga no orçamento de tempo do consumer.
export const CAMPAIGN_DISPATCH_SEND_BATCH_SIZE_PER_MESSAGE = 25;

export type TCampaignDispatchSendBatchPlan = { dispatchIds: string[]; idempotencyKey: string; delaySeconds: number };

/**
 * Divide os disparos em mensagens de lote. A chave de idempotência deriva do conteúdo do lote: o
 * mesmo conjunto publicado duas vezes (relógio e varredura no mesmo estado) é deduplicado na fila.
 * `firstDelayIndex` continua o espaçamento de uma rajada já em curso.
 */
export function planCampaignDispatchSendBatches({
	dispatchIds,
	generation,
	firstDelayIndex = 0,
}: {
	dispatchIds: string[];
	generation: string;
	firstDelayIndex?: number;
}): TCampaignDispatchSendBatchPlan[] {
	const unique = Array.from(new Set(dispatchIds));
	const plans: TCampaignDispatchSendBatchPlan[] = [];
	for (let index = 0; index < unique.length; index += CAMPAIGN_DISPATCH_SEND_BATCH_SIZE_PER_MESSAGE) {
		const chunk = unique.slice(index, index + CAMPAIGN_DISPATCH_SEND_BATCH_SIZE_PER_MESSAGE);
		const digest = createHash("sha1").update(chunk.join(",")).digest("hex").slice(0, 16);
		plans.push({
			dispatchIds: chunk,
			idempotencyKey: `send-batch-${generation}-${digest}`,
			delaySeconds: resolveClockPublishDelaySeconds(firstDelayIndex + plans.length),
		});
	}
	return plans;
}

/**
 * Publica disparos em mensagens de lote, espaçadas. Lança a primeira falha depois de tentar todas:
 * quem chama decide se a engole (o disparo fica ENFILEIRADA e a varredura de parados o recupera).
 */
export async function publishCampaignDispatchSendBatches({
	dispatchIds,
	generation,
	firstDelayIndex,
	sendMessage = send,
}: {
	dispatchIds: string[];
	generation: string;
	firstDelayIndex?: number;
	sendMessage?: typeof send;
}) {
	const plans = planCampaignDispatchSendBatches({ dispatchIds, generation, firstDelayIndex });
	const results = await Promise.allSettled(
		plans.map((plan) =>
			sendMessage(CAMPAIGN_DISPATCH_SEND_TOPIC, { dispatchIds: plan.dispatchIds } satisfies TCampaignDispatchSendMessage, {
				idempotencyKey: plan.idempotencyKey,
				...(plan.delaySeconds ? { delaySeconds: plan.delaySeconds } : {}),
			}),
		),
	);
	const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
	if (failure) throw failure.reason;
	return { messages: plans.length };
}

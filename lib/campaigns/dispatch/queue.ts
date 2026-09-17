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

export const CampaignDispatchSendMessageSchema = z.object({
	dispatchId: z.string({ invalid_type_error: "Tipo inválido para o id do disparo." }).min(1),
	// Índice do worker dentro do leque publicado pela expansão; só para logs.
	worker: z.number({ invalid_type_error: "Tipo inválido para o índice do worker." }).int().nonnegative().optional(),
});
export type TCampaignDispatchSendMessage = z.infer<typeof CampaignDispatchSendMessageSchema>;

export async function publishCampaignDispatchExpand({ dispatchId, attempt }: TCampaignDispatchExpandMessage & { attempt?: string }) {
	await send(CAMPAIGN_DISPATCH_EXPAND_TOPIC, { dispatchId } satisfies TCampaignDispatchExpandMessage, {
		// Uma expansão por disparo; a varredura de parados passa um `attempt` para republicar.
		idempotencyKey: attempt ? `expand-${dispatchId}-${attempt}` : `expand-${dispatchId}`,
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

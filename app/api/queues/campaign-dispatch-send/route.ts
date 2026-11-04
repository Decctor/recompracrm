import {
	CampaignDispatchSendMessageSchema,
	publishCampaignDispatchSendBatches,
	resolveCampaignDispatchSendMessageIds,
} from "@/lib/campaigns/dispatch/queue";
import { runCampaignDispatchSend } from "@/lib/campaigns/dispatch/send";
import { buildCampaignDispatchSendBatchError, runCampaignDispatchSendBatch } from "@/lib/campaigns/dispatch/send-batch";
import { handleCallback } from "@vercel/queue";

/**
 * Consumer do tópico `campaign-dispatch-send` (produtores: expansão, gatilhos de evento e o
 * relógio). Uma mensagem leva um disparo ou um lote deles (./send-batch.ts). At-least-once é
 * inócuo por construção: o lote é reivindicado com FOR UPDATE SKIP LOCKED e cada destinatário só
 * sai uma vez; um consumer reentregue encontra a fila vazia.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (message) => {
		const parsed = CampaignDispatchSendMessageSchema.parse(message);
		const result = await runCampaignDispatchSendBatch({
			dispatchIds: resolveCampaignDispatchSendMessageIds(parsed),
			worker: parsed.worker,
			runOne: runCampaignDispatchSend,
			publishContinuation: (dispatchIds) => publishCampaignDispatchSendBatches({ dispatchIds, generation: `cont-${Date.now()}` }),
		});
		if (result.continued.length > 0) {
			console.log(`[CAMPAIGN_DISPATCH] [send] Orçamento do lote esgotado; ${result.continued.length} disparo(s) seguem em continuação.`);
		}
		if (result.failed.length > 0) throw buildCampaignDispatchSendBatchError(result.failed);
	},
	{
		retry: (error, metadata) => {
			if (metadata.deliveryCount >= 3) {
				// O disparo continua no banco: a varredura de parados do relógio o republica.
				console.error("[CAMPAIGN_DISPATCH] [send] Mensagem descartada após 3 tentativas:", metadata.messageId, error);
				return { acknowledge: true };
			}
			return { afterSeconds: 30 };
		},
	},
);

import { CampaignDispatchSendMessageSchema } from "@/lib/campaigns/dispatch/queue";
import { runCampaignDispatchSend } from "@/lib/campaigns/dispatch/send";
import { handleCallback } from "@vercel/queue";

/**
 * Consumer do tópico `campaign-dispatch-send` (produtores: expansão, gatilhos de evento e o
 * relógio). At-least-once é inócuo por construção: o lote é reivindicado com FOR UPDATE SKIP
 * LOCKED e cada destinatário só sai uma vez; um consumer reentregue encontra a fila vazia.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (message) => {
		await runCampaignDispatchSend(CampaignDispatchSendMessageSchema.parse(message));
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

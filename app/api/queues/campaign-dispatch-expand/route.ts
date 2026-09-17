import { markCampaignDispatchExpandFailed, runCampaignDispatchExpand } from "@/lib/campaigns/dispatch/expand";
import { CampaignDispatchExpandMessageSchema } from "@/lib/campaigns/dispatch/queue";
import { notifyCampaignDispatchFailure } from "@/lib/cron/notify-campaign-dispatch-failure";
import { handleCallback } from "@vercel/queue";

/**
 * Consumer do tópico `campaign-dispatch-expand` (produtor: lib/campaigns/dispatch/clock.ts).
 * Sem URL pública: triggers `queue/v2beta` (vercel.json) só são invocáveis pela Vercel.
 * Reexecutar é seguro — a chave única (disparo, cliente) ignora destinatários já inseridos.
 */
const MAX_DELIVERIES = 3;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handleCallback(
	async (message, metadata) => {
		const { dispatchId } = CampaignDispatchExpandMessageSchema.parse(message);
		try {
			await runCampaignDispatchExpand({ dispatchId });
		} catch (error) {
			// Última tentativa: o disparo fica FALHOU e visível no painel, com alerta ao time.
			if (metadata.deliveryCount >= MAX_DELIVERIES) {
				const reason = await markCampaignDispatchExpandFailed({ dispatchId, error });
				await notifyCampaignDispatchFailure({ dispatchId, stage: "expand", error: reason });
			}
			throw error;
		}
	},
	{
		retry: (error, metadata) => {
			if (metadata.deliveryCount >= MAX_DELIVERIES) {
				console.error("[CAMPAIGN_DISPATCH] [expand] Mensagem descartada após 3 tentativas:", metadata.messageId, error);
				return { acknowledge: true };
			}
			return { afterSeconds: 60 };
		},
	},
);

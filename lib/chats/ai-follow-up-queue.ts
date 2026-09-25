import type { TAiFollowUpPayload } from "@/lib/chats/ai-follow-up-runner";
import { send } from "@vercel/queue";

/** Consumido por `app/api/queues/ai-chat-follow-up` (trigger `queue/v2beta` no vercel.json). */
export const AI_FOLLOW_UP_TOPIC = "ai-chat-follow-ups";

export async function sendFollowUpToQueue(payload: TAiFollowUpPayload): Promise<void> {
	await send(AI_FOLLOW_UP_TOPIC, payload, {
		// O cron reivindica com lease antes de publicar; uma republicação da mesma retomada
		// (retry do cron no meio do lote) conflita aqui em vez de virar duas execuções.
		idempotencyKey: `ai-follow-up-${payload.followUpId}-${payload.tentativa}`,
	});
}
